import {hashVoucherToken} from './tokens';
import {isUuid,parsePinResult,type PinFailureCode,type PinResult} from './pin-types';
interface Config {siteOrigin?:string;url?:string;secretKey?:string}
export const pinResponseHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const failure=(code:PinFailureCode,status:number)=>Response.json({ok:false,code},{status,headers:pinResponseHeaders});
/** Reads a bounded stream even when Content-Length is absent or dishonest. */
async function boundedText(stream:ReadableStream<Uint8Array>|null,limit:number):Promise<string> {
 if(!stream)return '';const reader=stream.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try{for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>limit){await reader.cancel();throw new RangeError('Body too large');}text+=decoder.decode(item.value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
function trustedOrigin(value:string|undefined):string {const u=new URL(value??'');if((u.protocol!=='https:'&&!(u.protocol==='http:'&&u.hostname==='127.0.0.1'))||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();return u.origin;}
export async function pinRequestResponse(request:Request,token:string,config:Config,transport:typeof fetch=fetch):Promise<Response> {
 if(request.method!=='POST')return failure('invalid_request',405);
 let origin:string;try{origin=trustedOrigin(config.siteOrigin);}catch{return failure('unavailable',503);}
 if(request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return failure('invalid_request',403);
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return failure('invalid_request',415);
 let hash:string;try{hash=hashVoucherToken(token);}catch{return failure('not_found',404);}
 let raw:Record<string,unknown>;try{const value:unknown=JSON.parse(await boundedText(request.body,2048));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();raw=value as Record<string,unknown>;}catch(e){return failure('invalid_request',e instanceof RangeError?413:400);}
 const redeem=raw.action==='redeem',undo=raw.action==='undo',keys=redeem?['action','pin','requestId','voucherIds']:['action','pin','batchId'];
 if(!(redeem||undo)||Object.keys(raw).length!==keys.length||Object.keys(raw).some(key=>!keys.includes(key))||typeof raw.pin!=='string'||!/^\d{4}$/.test(raw.pin)||redeem&&(!isUuid(raw.requestId)||!Array.isArray(raw.voucherIds)||raw.voucherIds.length<1||raw.voucherIds.length>6||!raw.voucherIds.every(isUuid)||new Set(raw.voucherIds.map((id:string)=>id.toLowerCase())).size!==raw.voucherIds.length)||undo&&!isUuid(raw.batchId))return failure('invalid_request',400);
 try {
  const db=new URL(config.url??'');if(db.protocol!=='https:'||db.username||db.password||db.pathname!=='/'||db.search||db.hash||!/^sb_secret_[A-Za-z0-9_-]+$/.test(config.secretKey??''))throw Error();
  const body=redeem?{p_token_hash:hash,p_pin:raw.pin,p_request_id:raw.requestId,p_vouchers:raw.voucherIds}:{p_token_hash:hash,p_pin:raw.pin,p_batch_id:raw.batchId};
  const response=await transport(new URL('/rest/v1/rpc/'+(redeem?'pci_redeem_pin_batch':'pci_undo_pin_batch'),db),{method:'POST',headers:{apikey:config.secretKey!,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error();const result:PinResult=parsePinResult(JSON.parse(await boundedText(response.body,16384)));
  if(result.ok&&(result.batchId.toLowerCase()!==String(redeem?raw.requestId:raw.batchId).toLowerCase()||redeem&&(result.quantity!==(raw.voucherIds as string[]).length||result.code==='undone')||undo&&!['undone','already_undone'].includes(result.code)))throw Error();
  const status=result.ok?200:result.code==='pin_locked'?429:result.code==='not_found'?404:['unavailable','pin_not_configured'].includes(result.code)?503:['state_changed','request_conflict','not_current','undo_window_closed'].includes(result.code)?409:400;
  return Response.json(result,{status,headers:pinResponseHeaders});
 }catch{return failure('unavailable',503);}
}
