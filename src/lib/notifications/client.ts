import {isUuid} from '../vouchers/pin-types';import {limitedText} from '../auth/client';import {notificationDispatchWindow,parseFrozenMessage,type NotificationRuntime} from './types';
const rpcs=['pci_claim_notification','pci_claim_merchant_notification','pci_queue_merchant_reports','pci_prepare_notification','pci_begin_notification','pci_finish_notification'] as const;
export async function notificationRpc(config:NotificationRuntime,name:typeof rpcs[number],body:Record<string,unknown>,transport:typeof fetch=fetch):Promise<Record<string,unknown>>{if(!rpcs.includes(name))throw Error('Unsupported notification RPC');const response=await transport(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.secretKey,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Notification service unavailable');const value:unknown=JSON.parse(await limitedText(response,2097152));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Notification service unavailable');return value as Record<string,unknown>;}
export type ProviderResult={kind:'accepted';providerId:string}|{kind:'retry'|'hold';error:'unconfirmed'|'provider_rejected'|'payload_conflict'};
/** Exact frozen bytes, fixed provider origin, no request-controlled address or redirect. */
export async function sendNotification(config:NotificationRuntime,id:string,body:string,permit:NotificationSendPermit,transport:typeof fetch=fetch):Promise<ProviderResult>{if(!isUuid(id))throw Error('Invalid notification identity');parseFrozenMessage(body,id);if(!permit.canSend())return {kind:'retry',error:'unconfirmed'};try{const response=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.resendKey,'Content-Type':'application/json','Idempotency-Key':'pci-notification/'+id},body,cache:'no-store',redirect:'error',signal:AbortSignal.any([permit.signal,AbortSignal.timeout(8000)])});const value:unknown=JSON.parse(await limitedText(response,16384)),result=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};if(response.ok){if(isUuid(result.id))return {kind:'accepted',providerId:result.id.toLowerCase()};return {kind:'retry',error:'unconfirmed'};}if(response.status===409)return result.name==='invalid_idempotent_request'?{kind:'hold',error:'payload_conflict'}:{kind:'retry',error:'unconfirmed'};if(response.status===408||response.status===429||response.status>=500||response.status<400)return {kind:'retry',error:'unconfirmed'};return {kind:'hold',error:'provider_rejected'};}catch{return {kind:'retry',error:'unconfirmed'};}}

export interface NotificationClock{wallNow():number;monotonicNow():number}
export const notificationClock:NotificationClock={wallNow:()=>Date.now(),monotonicNow:()=>performance.now()};
export interface NotificationSendPermit{signal:AbortSignal;canSend():boolean}
export function notificationSendPermit(reply:unknown,start:{wall:number;monotonic:number},clock:NotificationClock):NotificationSendPermit|null{
 const duration=notificationDispatchWindow(reply);if(duration===null)return null;
 // Subtract the entire RPC duration, including lock wait and suspended time.
 // Either clock can exhaust the permit; rollback fails closed.
 const remaining=()=>{const wall=clock.wallNow()-start.wall,monotonic=clock.monotonicNow()-start.monotonic;return Number.isFinite(wall)&&Number.isFinite(monotonic)&&wall>=0&&monotonic>=0?duration-Math.max(wall,monotonic):-Infinity;};
 const budget=remaining();if(budget<=8000)return null;
 const signal=AbortSignal.timeout(Math.floor(budget));
 return {signal,canSend:()=>!signal.aborted&&remaining()>8000};
}
