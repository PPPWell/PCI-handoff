import {createHash} from 'node:crypto';
import {isUuid} from '../vouchers/pin-types';
import {normalizedEmail} from '../auth/service';
import {romeDate} from '../vouchers/reservation';
import {statementTotals,type StatementRow,type StatementTotals} from '../merchant/statement-types';

export interface MerchantReportFacts {
 kind:'merchant-daily'|'merchant-weekly';reportId:string;reportHash:string;ownerId:string;restaurantId:string;restaurant:string;recipient:string;language:'it';
 periodStart:string;periodEnd:string;fromAt:string;untilAt:string;sourceAsOf:string;reconciliation:'unverified';
 rows:StatementRow[];withdrawals:{id:string;menu:string;amountCents:string;occurredAt:string;recordedAt:string}[];totals:StatementTotals;
}
function invalid():never{throw Error('Invalid merchant report');}
const obj=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();return v as Record<string,unknown>;};
function text(v:unknown,max=500){if(typeof v!=='string'||!v.trim()||v.length>max)invalid();return v;}
function uuid(v:unknown){if(!isUuid(v))invalid();return v.toLowerCase();}
function integer(v:unknown,signed=false){if(typeof v!=='string'||!(signed?/^(0|-?[1-9][0-9]{0,38})$/:/^(0|[1-9][0-9]{0,38})$/).test(v))invalid();return v;}
function date(v:unknown){const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)invalid();return s;}
function time(v:unknown){const s=text(v,40);if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(s)||!Number.isFinite(Date.parse(s)))invalid();date(s.slice(0,10));return s;}
const midnight=(s:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(s))==='00:00:00';
export function isMerchantReportFacts(v:{kind:string}):v is MerchantReportFacts{return v.kind==='merchant-daily'||v.kind==='merchant-weekly';}
export function parseMerchantReportFacts(value:unknown):MerchantReportFacts{
 const r=obj(value),kind=r.kind;if(kind!=='merchant-daily'&&kind!=='merchant-weekly'||r.language!=='it'||r.reconciliation!=='unverified')invalid();
 const periodStart=date(r.periodStart),periodEnd=date(r.periodEnd),fromAt=time(r.fromAt),untilAt=time(r.untilAt),sourceAsOf=time(r.sourceAsOf),days=(Date.parse(periodEnd)-Date.parse(periodStart))/86400000;
 if(days!==(kind==='merchant-daily'?1:7)||kind==='merchant-weekly'&&new Date(periodStart).getUTCDay()!==1||romeDate(new Date(fromAt))!==periodStart||romeDate(new Date(untilAt))!==periodEnd||!midnight(fromAt)||!midnight(untilAt)||Date.parse(sourceAsOf)<Date.parse(untilAt))invalid();
 if(!Array.isArray(r.rows)||!Array.isArray(r.withdrawals)||r.rows.length+r.withdrawals.length>1000)invalid();
 const inPeriod=(v:unknown)=>{const s=time(v);if(Date.parse(s)<Date.parse(fromAt)||Date.parse(s)>=Date.parse(untilAt))invalid();return s;};
 const rows:StatementRow[]=r.rows.map(value=>{
  const e=obj(value),kind=String(e.kind),salesMode=String(e.salesMode),id=integer(e.id);if(id==='0'||BigInt(id)>9223372036854775807n||!['sale','issue','redeem','undo','refund'].includes(kind)||!['prepaid','pay-at-restaurant'].includes(salesMode)||!Number.isInteger(e.quantity)||Number(e.quantity)<1||Number(e.quantity)>6)invalid();
  const onlineCents=integer(e.onlineCents,true),commissionCents=e.commissionCents===null?null:integer(e.commissionCents,true),commissionVatCents=e.commissionVatCents===null?null:integer(e.commissionVatCents,true);
  if((commissionCents===null)!==(commissionVatCents===null)||commissionCents===null&&!(salesMode==='pay-at-restaurant'&&['redeem','undo'].includes(kind))||['issue','redeem','undo'].includes(kind)&&onlineCents!=='0'||kind==='sale'&&(salesMode!=='prepaid'||BigInt(onlineCents)<0n)||kind==='issue'&&salesMode!=='pay-at-restaurant'||kind==='refund'&&BigInt(onlineCents)>0n)invalid();
  return {id,kind:kind as StatementRow['kind'],salesMode:salesMode as StatementRow['salesMode'],quantity:Number(e.quantity),onlineCents,commissionCents,commissionVatCents,menu:text(e.menu),occurredAt:time(e.occurredAt),recordedAt:inPeriod(e.recordedAt)};
 });
 const withdrawals=r.withdrawals.map(value=>{const w=obj(value);return {id:uuid(w.id),menu:text(w.menu),amountCents:integer(w.amountCents),occurredAt:time(w.occurredAt),recordedAt:inPeriod(w.recordedAt)};});
 if(new Set(rows.map(e=>e.id)).size!==rows.length||new Set(withdrawals.map(w=>w.id)).size!==withdrawals.length)invalid();
 const computed=statementTotals(rows),totals=obj(r.totals);for(const key of Object.keys(computed) as (keyof StatementTotals)[])if(totals[key]!==computed[key])invalid();
 const recipient=normalizedEmail(r.recipient);if(!recipient||recipient!==r.recipient)invalid();const reportHash=text(r.reportHash,64);if(!/^[a-f0-9]{64}$/.test(reportHash))invalid();
 return {kind,reportId:uuid(r.reportId),reportHash,ownerId:uuid(r.ownerId),restaurantId:uuid(r.restaurantId),restaurant:text(r.restaurant),recipient,language:'it',periodStart,periodEnd,fromAt,untilAt,sourceAsOf,reconciliation:'unverified',rows,withdrawals,totals:computed};
}
export function merchantReportSourceHash(f:MerchantReportFacts){return createHash('sha256').update([f.recipient,f.kind,f.restaurantId,f.ownerId,f.reportId,f.language,f.reportHash].join('\n')).digest('hex');}
