import type {Locale} from '../i18n';
import {isLocale} from '../i18n';
import {isUuid} from '../vouchers/pin-types';
import type {VoucherStatus} from '../vouchers/read';
import {romeDate} from '../vouchers/reservation';
export type ManagementPurpose='withdrawal'|'extension';
export interface ManagementRefund {id:string;status:'pending'|'processing'|'succeeded'|'cancelled'|'failed';availableAfter:string;amountCents:number}
export interface ManagementSuccess {ok:true;operationId:string;purpose:ManagementPurpose;voucherId:string;code:'extended'|'withdrawal_requested';completedAt:string;serverNow:string;replayed:boolean;voucherStatus:VoucherStatus;expiresOn:string;refund:ManagementRefund|null;notificationStatus:'pending'|'processing'|'sent'|'failed'|'cancelled'|null}
export interface ManagementView {serverNow:string;voucherId:string;orderId:string;language:Locale;salesMode:'prepaid'|'pay-at-restaurant';unitAmountCents:number;purchasedAt:string;withdrawalDeadline:string;status:VoucherStatus;expiresOn:string;extensionExpiresOn:string;extendedOnce:boolean;redeemedAt:string|null;restaurant:string;menu:{version:number;people:number;names:Record<Locale,string|null>};withdrawalAvailable:boolean;extensionAvailable:boolean;refund:ManagementRefund|null;lastOperation:ManagementSuccess|null}
export const isManagementPurpose=(v:unknown):v is ManagementPurpose=>v==='withdrawal'||v==='extension';
function invalid():never {throw Error('Invalid management data');}
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();return v as Record<string,unknown>;}
function text(v:unknown,max=500):string{if(typeof v!=='string'||!v.trim()||v.length>max)invalid();return v;}
function uuid(v:unknown){if(!isUuid(v))invalid();return v;}
function integer(v:unknown,max:number,min=0){if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)invalid();return Number(v);}
function bool(v:unknown){if(typeof v!=='boolean')invalid();return v;}
export function managementDay(v:unknown):string{const s=text(v,10);if(!/^\d{4}-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)invalid();return s;}
export function managementTime(v:unknown):string{const s=text(v,64);managementDay(s.slice(0,10));if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s)||!Number.isFinite(Date.parse(s)))invalid();return s;}
function status(v:unknown):VoucherStatus{if(!['unused','extended','redeemed','withdrawn','refunded','expired'].includes(String(v)))invalid();return v as VoucherStatus;}
function refund(v:unknown):ManagementRefund|null{if(v===null)return null;const r=obj(v);if(!['pending','processing','succeeded','cancelled','failed'].includes(String(r.status)))invalid();return {id:uuid(r.id),status:r.status as ManagementRefund['status'],availableAfter:managementTime(r.availableAfter),amountCents:integer(r.amountCents,2147483647)};}
export function parseManagementResult(value:unknown):ManagementSuccess {
 const v=obj(value);if(v.ok!==true||!isManagementPurpose(v.purpose)||v.code!==(v.purpose==='extension'?'extended':'withdrawal_requested'))invalid();const r=refund(v.refund),completedAt=managementTime(v.completedAt),serverNow=managementTime(v.serverNow);if((v.purpose==='withdrawal')!==(r!==null)||Date.parse(serverNow)<Date.parse(completedAt)||!(v.notificationStatus===null||['pending','processing','sent','failed','cancelled'].includes(String(v.notificationStatus))))invalid();
 return {ok:true,operationId:uuid(v.operationId),purpose:v.purpose,voucherId:uuid(v.voucherId),code:v.code as ManagementSuccess['code'],completedAt,serverNow,replayed:bool(v.replayed),voucherStatus:status(v.voucherStatus),expiresOn:managementDay(v.expiresOn),refund:r,notificationStatus:v.notificationStatus as ManagementSuccess['notificationStatus']};
}
export function parseManagementView(value:unknown):ManagementView {
 const v=obj(value),m=obj(v.menu),translations=obj(m.translations);if(v.ok!==true||!isLocale(String(v.language))||!['prepaid','pay-at-restaurant'].includes(String(v.salesMode)))invalid();const serverNow=managementTime(v.serverNow),withdrawalDeadline=managementTime(v.withdrawalDeadline),expiresOn=managementDay(v.expiresOn),s=status(v.status),r=refund(v.refund),withdrawalAvailable=bool(v.withdrawalAvailable),extensionAvailable=bool(v.extensionAvailable),extendedOnce=bool(v.extendedOnce),redeemedAt=v.redeemedAt===null?null:managementTime(v.redeemedAt),voucherId=uuid(v.voucherId),lastOperation=v.lastOperation===null?null:parseManagementResult(v.lastOperation);
 if((s==='redeemed')!==(redeemedAt!==null)||s==='extended'&&!extendedOnce||s==='unused'&&extendedOnce||lastOperation&&lastOperation.voucherId!==voucherId)invalid();
 if((withdrawalAvailable||extensionAvailable)&&(s!=='unused'||extendedOnce||expiresOn<romeDate(new Date(serverNow))||r&&['pending','processing'].includes(r.status))||withdrawalAvailable&&extensionAvailable||withdrawalAvailable&&Date.parse(serverNow)>Date.parse(withdrawalDeadline)||extensionAvailable&&Date.parse(serverNow)<=Date.parse(withdrawalDeadline))invalid();
 const names=Object.fromEntries(['zh','it','en'].map(locale=>{const c=obj(translations[locale]);return [locale,c.name==null?null:text(c.name)];})) as Record<Locale,string|null>;
 return {serverNow,voucherId,orderId:uuid(v.orderId),language:v.language as Locale,salesMode:v.salesMode as ManagementView['salesMode'],unitAmountCents:integer(v.unitAmountCents,2147483647),purchasedAt:managementTime(v.purchasedAt),withdrawalDeadline,status:s,expiresOn,extensionExpiresOn:managementDay(v.extensionExpiresOn),extendedOnce,redeemedAt,restaurant:text(v.restaurant),menu:{version:integer(m.version,2147483647,1),people:integer(m.people,100,1),names},withdrawalAvailable,extensionAvailable,refund:r,lastOperation};
}
