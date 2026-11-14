import {randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import {parseCookieHeader,type CookieOptions} from '@supabase/ssr';
import {isLocale} from '../i18n';
import {hashVoucherToken} from '../vouchers/tokens';
import {isUuid} from '../vouchers/pin-types';
import {authRpc,createAuthClient,limitedText,validatedAuthConfig,type AuthConfig,type ValidAuthConfig} from './client';
export const authPrivateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const timestamp=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value));
export function normalizedEmail(value:unknown):string|null {if(typeof value!=='string')return null;const email=value.trim().toLowerCase();return email.length<=254&&/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email)?email:null;}
function json(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:authPrivateHeaders});}
function fail(code:string,status:number,extra:Record<string,unknown>={}){return json({ok:false,code,...extra},status);}
function challengeName(config:ValidAuthConfig){return config.secure?'__Host-pci-email':'pci-email';}
function failure(result:Record<string,unknown>) {
 const code=String(result.code),allowed=['send_cooldown','verification_locked','verification_busy','invalid_challenge','challenge_used','code_expired','not_sent','incorrect_code'];if(!allowed.includes(code))return fail('unavailable',503);
 const extra:Record<string,unknown>={};if(timestamp(result.retryAt))extra.retryAt=result.retryAt;if(Number.isInteger(result.attemptsRemaining)&&Number(result.attemptsRemaining)>=0&&Number(result.attemptsRemaining)<=4)extra.attemptsRemaining=result.attemptsRemaining;
 return fail(code,['send_cooldown','verification_locked','verification_busy'].includes(code)?429:400,extra);
}
/** Strict origin and input checks precede every external action. Cookie writes remain buffered until verified. */
export async function emailAuthResponse(action:'start'|'verify'|'logout',request:Request,rawConfig:AuthConfig,transport:typeof fetch=fetch):Promise<NextResponse> {
 if(request.method!=='POST')return fail('invalid_request',405);
 const config=validatedAuthConfig(rawConfig);if(!config||action!=='logout'&&!config.emailEnabled)return fail('unavailable',503);
 if(request.headers.get('Origin')!==config.siteOrigin||request.headers.get('Sec-Fetch-Site')==='cross-site')return fail('invalid_request',403);
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return fail('invalid_request',415);
 let body:Record<string,unknown>;try{const value:unknown=JSON.parse(await limitedText(new Response(request.body),2048));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();body=value as Record<string,unknown>;}catch{return fail('invalid_request',400);}
 const keys=action==='start'?['email','locale']:action==='verify'?['code','locale']:['locale'];if(Object.keys(body).length!==keys.length||Object.keys(body).some(key=>!keys.includes(key))||!isLocale(String(body.locale)))return fail('invalid_request',400);
 const pendingCookies:{name:string;value:string;options:CookieOptions}[]=[],cookieHeaders:Record<string,string>={};
 const client=createAuthClient(config,{getAll:()=>parseCookieHeader(request.headers.get('Cookie')??'').map(c=>({name:c.name,value:c.value??''})),setAll:(items,headers)=>{for(const item of items)pendingCookies.push(item);Object.assign(cookieHeaders,headers);}},transport);
 function commitCookies(response:NextResponse) {for(const item of pendingCookies)response.cookies.set(item.name,item.value,{...item.options,httpOnly:true,secure:config!.secure,sameSite:'lax',path:'/'});for(const [key,value] of Object.entries(cookieHeaders))response.headers.set(key,value);return response;}
 try {
  if(action==='start') {
   const email=normalizedEmail(body.email);if(!email)return fail('invalid_request',400);const token=randomBytes(32).toString('base64url'),hash=hashVoucherToken(token),reserved=await authRpc(config,'pci_auth_start',{p_email:email,p_hash:hash},transport);if(reserved.ok!==true)return failure(reserved);if(!timestamp(reserved.expiresAt)||!timestamp(reserved.retryAt))throw Error();
   const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true}});const marked=await authRpc(config,'pci_auth_mark_sent',{p_hash:hash,p_sent:!error},transport);if(error||marked.ok!==true)return fail('unavailable',503);
   const response=json({ok:true,code:'code_sent',expiresAt:reserved.expiresAt,retryAt:reserved.retryAt});response.cookies.set(challengeName(config),token,{httpOnly:true,secure:config.secure,sameSite:'lax',path:'/',maxAge:600});return response;
  }
  if(action==='verify') {
   if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))return fail('invalid_request',400);
   const token=parseCookieHeader(request.headers.get('Cookie')??'').find(c=>c.name===challengeName(config))?.value;let hash:string;try{hash=hashVoucherToken(token??'');}catch{return fail('invalid_challenge',400);}
   const reserved=await authRpc(config,'pci_auth_begin_verify',{p_hash:hash},transport);if(reserved.ok!==true)return failure(reserved);const email=normalizedEmail(reserved.email);if(!email||!isUuid(reserved.leaseId))throw Error();
   const {data,error}=await client.auth.verifyOtp({email,token:body.code,type:'email'});
   if(error){const ended=await authRpc(config,'pci_auth_finish_verify',{p_hash:hash,p_lease:reserved.leaseId,p_user:null},transport);return error.status&&error.status<500?failure(ended):fail('unavailable',503);}
   const user=data.user;if(!data.session||!user||!isUuid(user.id)||normalizedEmail(user.email)!==email||!user.email_confirmed_at)throw Error();
   const finished=await authRpc(config,'pci_auth_finish_verify',{p_hash:hash,p_lease:reserved.leaseId,p_user:user.id},transport);if(finished.ok!==true)throw Error();
   // An owner invite for this email (see the admin console) becomes ownership at the first sign-in; a failure here never blocks signing in.
   try{await client.rpc('pci_claim_owner_invites');}catch{/* the invite stays pending and is tried again at the next sign-in */}
   const response=commitCookies(json({ok:true,code:'signed_in',path:`/${body.locale}/account/`}));response.cookies.set(challengeName(config),'',{httpOnly:true,secure:config.secure,sameSite:'lax',path:'/',maxAge:0});return response;
  }
  const result=await client.auth.signOut({scope:'local'});if(result.error) return fail('unavailable',503);
  const response=commitCookies(json({ok:true,code:'signed_out',path:`/${body.locale}/account/`}));response.cookies.set(challengeName(config),'',{httpOnly:true,secure:config.secure,sameSite:'lax',path:'/',maxAge:0});return response;
 }catch{return fail('unavailable',503);}
}
