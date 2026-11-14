import {NextResponse} from 'next/server';
import {parseCookieHeader,type CookieOptions} from '@supabase/ssr';
import {createAuthClient,validatedAuthConfig,limitedText,type AuthConfig} from '../auth/client';
import {authPrivateHeaders} from '../auth/service';
import {hashVoucherToken} from '../vouchers/tokens';
import {isUuid,parsePinResult} from '../vouchers/pin-types';
import {merchantErrors} from './types';
const json=(v:Record<string,unknown>,status=200)=>NextResponse.json(v,{status,headers:authPrivateHeaders});
const fail=(code:string,status:number)=>json({ok:false,code},status);
export async function merchantResponse(request:Request,token:string,rawConfig:AuthConfig,transport:typeof fetch=fetch):Promise<NextResponse>{
 if(request.method!=='POST')return fail('invalid_request',405);const config=validatedAuthConfig(rawConfig);if(!config)return fail('unavailable',503);
 if(request.headers.get('Origin')!==config.siteOrigin||request.headers.get('Sec-Fetch-Site')==='cross-site')return fail('invalid_request',403);let hash:string;try{hash=hashVoucherToken(token);}catch{return fail('not_found',404);}
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return fail('invalid_request',415);
 let body:Record<string,unknown>;try{const raw:unknown=JSON.parse(await limitedText(new Response(request.body),2048));if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error();body=raw as Record<string,unknown>;const keys=Object.keys(body);if(body.action==='redeem'){if(keys.length!==3||keys.some(k=>!['action','requestId','voucherIds'].includes(k))||!isUuid(body.requestId)||!Array.isArray(body.voucherIds)||body.voucherIds.length<1||body.voucherIds.length>6||!body.voucherIds.every(isUuid))throw Error();body.voucherIds=body.voucherIds.map(v=>v.toLowerCase());if(new Set(body.voucherIds as string[]).size!==(body.voucherIds as string[]).length)throw Error();}else if(body.action==='undo'){if(keys.length!==2||!keys.includes('batchId')||!isUuid(body.batchId))throw Error();}else throw Error();}catch{return fail('invalid_request',400);}
 const writes:{name:string;value:string;options:CookieOptions}[]=[],cache:Record<string,string>={};const client=createAuthClient(config,{getAll:()=>parseCookieHeader(request.headers.get('Cookie')??'').map(c=>({name:c.name,value:c.value??''})),setAll:(items,headers)=>{writes.push(...items);Object.assign(cache,headers);}},transport);
 function commit(response:NextResponse){for(const item of writes)response.cookies.set(item.name,item.value,{...item.options,httpOnly:true,secure:config!.secure,sameSite:'lax',path:'/'});for(const [key,value] of Object.entries(cache))response.headers.set(key,value);return response;}
 try{const {data,error}=await client.auth.getUser();if(error)return commit(fail(error.name==='AuthSessionMissingError'||error.status===401||error.status===403?'sign_in_required':'unavailable',error.name==='AuthSessionMissingError'||error.status===401||error.status===403?401:503));if(!data.user?.email_confirmed_at||!isUuid(data.user.id))return commit(fail('sign_in_required',401));
 const {data:raw,error:rpcError}=await client.rpc(body.action==='redeem'?'pci_redeem_merchant_batch':'pci_undo_merchant_batch',body.action==='redeem'?{p_token_hash:hash,p_request_id:String(body.requestId).toLowerCase(),p_vouchers:body.voucherIds}:{p_token_hash:hash,p_batch_id:String(body.batchId).toLowerCase()});if(rpcError)throw Error();if(raw&&typeof raw==='object'&&(raw as {ok?:unknown}).ok===false){const code=String((raw as {code?:unknown}).code);if(!Object.hasOwn(merchantErrors,code))throw Error();return commit(fail(code,code==='not_found'?404:code==='sign_in_required'?401:409));}
 const parsed=parsePinResult(raw);if(!parsed.ok||parsed.batchId.toLowerCase()!==String(body.action==='redeem'?body.requestId:body.batchId).toLowerCase()||body.action==='redeem'&&parsed.quantity!==(body.voucherIds as string[]).length)throw Error();return commit(json({...parsed,batchId:parsed.batchId.toLowerCase()}));
 }catch{return commit(fail('unavailable',503));}
}
