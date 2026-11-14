import {createHash,timingSafeEqual} from 'node:crypto';
import {authPrivateHeaders} from '../auth/service';
import {notificationRpc} from './client';
import {validateNotificationConfig,type NotificationConfig} from './types';
import {runNotification,type NotificationCounts} from './worker';
export interface MerchantReportCounts extends NotificationCounts{periods:number;queued:number;overflow:number}
export async function runMerchantReports(raw:NotificationConfig,transport:typeof fetch=fetch):Promise<MerchantReportCounts>{
 const config=validateNotificationConfig(raw);if(!config||raw.merchantReportsEnabled!==true)throw Error('Merchant reports unavailable');
 const r=await notificationRpc(config,'pci_queue_merchant_reports',{},transport);
 if(r.ok!==true||!Number.isInteger(r.periods)||Number(r.periods)<0||Number(r.periods)>1||!Number.isSafeInteger(r.queued)||Number(r.queued)<0||!Number.isInteger(r.overflow)||Number(r.overflow)<0||Number(r.overflow)>Number(r.periods))throw Error('Merchant reports unavailable');
 const delivered=await runNotification(raw,transport,undefined,'merchant');
 return {periods:Number(r.periods),queued:Number(r.queued),overflow:Number(r.overflow),...delivered};
}
export async function handleMerchantReports(request:Request,raw:NotificationConfig,transport:typeof fetch=fetch):Promise<Response>{
 const fail=(code:string,status:number)=>Response.json({ok:false,code},{status,headers:authPrivateHeaders}),digest=(s:string)=>createHash('sha256').update(s).digest();
 if(request.method!=='GET')return fail('method_not_allowed',405);
 if(!raw.cronSecret||raw.cronSecret.length<32)return fail('merchant_reports_unavailable',503);
 if(!timingSafeEqual(digest(request.headers.get('Authorization')??''),digest('Bearer '+raw.cronSecret)))return fail('unauthorized',401);
 if(new URL(request.url).search)return fail('invalid_request',400);
 const config=validateNotificationConfig(raw);if(!config||raw.merchantReportsEnabled!==true)return fail('merchant_reports_unavailable',503);
 if(request.headers.has('Origin')&&request.headers.get('Origin')!==config.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return fail('invalid_request',403);
 try{return Response.json({ok:true,...await runMerchantReports(raw,transport)},{headers:authPrivateHeaders});}catch{return fail('merchant_reports_unavailable',503);}
}
