import {parseVoucherView} from '../vouchers/read';
import {isUuid,parsePinResult} from '../vouchers/pin-types';
import type {MerchantVoucher,MerchantToday} from './types';
function invalid():never{throw Error('Invalid merchant data');}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();return v as Record<string,unknown>;}
function text(v:unknown,max=500):string{if(typeof v!=='string'||!v.trim()||v.length>max)invalid();return v;}
function uuid(v:unknown){if(!isUuid(v))invalid();return v.toLowerCase();}
function time(v:unknown){const value=text(v,64);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))invalid();return value;}
export function parseMerchantVoucher(v:unknown):MerchantVoucher {const raw=object(v);if(raw.ok!==true)invalid();const view=parseVoucherView(raw.view),batch=raw.lastBatch==null?null:parsePinResult(raw.lastBatch);if(batch&&!batch.ok)invalid();return {view,lastBatch:batch&&batch.ok?batch:null};}
export function parseMerchantToday(v:unknown):MerchantToday {
 const raw=object(v);if(raw.ok!==true||!Array.isArray(raw.restaurants)||raw.restaurants.length<1||!Array.isArray(raw.records)||raw.records.length>50)invalid();const date=text(raw.date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)invalid();
 const restaurants=raw.restaurants.map(v=>{const r=object(v);return {id:uuid(r.id),name:text(r.name)};}),restaurantId=uuid(raw.restaurantId);if(!restaurants.some(r=>r.id===restaurantId)||new Set(restaurants.map(r=>r.id)).size!==restaurants.length)invalid();
 const records=raw.records.map(v=>{const r=object(v),method=r.method,shortCode=text(r.shortCode,9),people=Number(r.people);if(!['pin','scan','short_code','offline'].includes(String(method))||!Number.isInteger(people)||people<1||people>100||!/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(shortCode))invalid();return {id:uuid(r.id),redeemedAt:time(r.redeemedAt),servedAt:r.servedAt==null?null:time(r.servedAt),voidedAt:r.voidedAt===null?null:time(r.voidedAt),method:method as MerchantToday['records'][number]['method'],shortCode,menu:r.menu===null?null:text(r.menu),people};});
 const cursor=raw.nextCursor==null?null:object(raw.nextCursor),nextCursor=cursor?{at:time(cursor.at),id:uuid(cursor.id)}:null;return {serverNow:time(raw.serverNow),date,restaurants,restaurantId,records,nextCursor};
}
