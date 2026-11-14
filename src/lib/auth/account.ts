import type {Locale} from '../i18n';
import {isLocale} from '../i18n';
import {isUuid} from '../vouchers/pin-types';
import {decryptVoucherCapability,hashVoucherToken} from '../vouchers/tokens';
import type {VoucherStatus} from '../vouchers/read';
import {romeDate} from '../vouchers/reservation';
import {authRpc,type ValidAuthConfig} from './client';
export interface AccountVoucher {id:string;status:VoucherStatus;expiresOn:string;redeemedAt:string|null;extendedOnce:boolean;usable:boolean}
export interface AccountOrder {id:string;purchasedAt:string;quantity:number;language:Locale;restaurant:string;menu:{version:number;people:number;names:Record<Locale,string|null>};vouchers:AccountVoucher[];voucherPath:string|null}
export interface AccountPageData {serverNow:string;orders:AccountOrder[];nextCursor:string|null}
function invalid():never{throw Error('Invalid account data');}
function obj(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=500):string{if(typeof value!=='string'||!value.trim()||value.length>max)invalid();return value;}
function number(value:unknown,max:number):number{if(!Number.isInteger(value)||Number(value)<1||Number(value)>max)invalid();return Number(value);}
function day(value:unknown):string{const s=text(value,10);if(!/^\d{4}-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)invalid();return s;}
function time(value:unknown):string{const s=text(value,64);day(s.slice(0,10));if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s)||!Number.isFinite(Date.parse(s)))invalid();return s;}
function uuid(value:unknown):string{if(!isUuid(value))invalid();return value;}
export function decodeAccountCursor(value:string|null):{purchasedAt:string;id:string}|null {if(value===null)return null;try{if(value.length>256||!/^[A-Za-z0-9_-]+$/.test(value))invalid();const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)invalid();const raw=obj(JSON.parse(bytes.toString('utf8')));return {purchasedAt:time(raw.purchasedAt),id:uuid(raw.id)};}catch{invalid();}}
/** Rebuild the browser DTO; encrypted capability material and provider extras never leave this module. */
export function parseAccountPage(value:unknown,keyring:Record<string,Buffer>):AccountPageData {
 const raw=obj(value),serverNow=time(raw.serverNow),today=romeDate(new Date(serverNow));if(raw.ok!==true||!Array.isArray(raw.orders)||raw.orders.length>20)invalid();
 const orders=raw.orders.map((value):AccountOrder=>{const o=obj(value),id=uuid(o.id),restaurant=obj(o.restaurant),menu=obj(o.menu),translations=obj(menu.translations),quantity=number(o.quantity,6);if(!isLocale(String(o.language))||!Array.isArray(o.vouchers)||o.vouchers.length>quantity)invalid();
  const names=Object.fromEntries(['zh','it','en'].map(locale=>{const translation=obj(translations[locale]);return [locale,translation.name==null?null:text(translation.name)];})) as Record<Locale,string|null>;
  const vouchers=o.vouchers.map((value):AccountVoucher=>{const v=obj(value),status=text(v.status),expiresOn=day(v.expiresOn),redeemedAt=v.redeemedAt===null?null:time(v.redeemedAt);if(!['unused','extended','redeemed','withdrawn','refunded','expired'].includes(status)||typeof v.extendedOnce!=='boolean'||typeof v.usable!=='boolean'||v.usable&&(!['unused','extended'].includes(status)||expiresOn<today)||(status==='redeemed')!==(redeemedAt!==null)||status==='extended'&&!v.extendedOnce||status==='unused'&&v.extendedOnce)invalid();return {id:uuid(v.id),status:status as VoucherStatus,expiresOn,redeemedAt,extendedOnce:v.extendedOnce,usable:v.usable};});
  if(new Set(vouchers.map(v=>v.id)).size!==vouchers.length)invalid();let voucherPath:string|null=null;
  if(o.capability!==null){const cap=obj(o.capability);try{const token=decryptVoucherCapability(text(cap.encryptedToken,1000),keyring,'order:'+id);if(hashVoucherToken(token)!==cap.tokenHash)throw Error();if(vouchers.length>0)voucherPath='/v/'+token+'/';}catch{/* Missing/rotated keys must not invent or expose an unusable link. */}}
  return {id,purchasedAt:time(o.purchasedAt),quantity,language:o.language as Locale,restaurant:text(restaurant.name),menu:{version:number(menu.version,2147483647),people:number(menu.people,100),names},vouchers,voucherPath};
 });
 if(new Set(orders.map(o=>o.id)).size!==orders.length)invalid();let nextCursor:string|null=null;if(raw.nextCursor!==null){const cursor=obj(raw.nextCursor);nextCursor=Buffer.from(JSON.stringify({purchasedAt:time(cursor.purchasedAt),id:uuid(cursor.id)})).toString('base64url');}
 return {serverNow,orders,nextCursor};
}
export function voucherKeyring(env:Record<string,string|undefined>):Record<string,Buffer> {try{const keys:Record<string,Buffer>={},id=env.VOUCHER_ENCRYPTION_KEY_ID??'primary';if(env.VOUCHER_PREVIOUS_KEYS){const raw=obj(JSON.parse(env.VOUCHER_PREVIOUS_KEYS));for(const [name,value] of Object.entries(raw)){if(!/^[A-Za-z0-9_-]{1,32}$/.test(name)||typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value))throw Error();keys[name]=Buffer.from(value,'hex');}}if(/^[A-Za-z0-9_-]{1,32}$/.test(id)&&/^[a-f0-9]{64}$/i.test(env.VOUCHER_ENCRYPTION_KEY??''))keys[id]=Buffer.from(env.VOUCHER_ENCRYPTION_KEY!,'hex');return keys;}catch{return {};}}
export async function loadPurchaserAccount(userId:string,cursor:string|null,config:ValidAuthConfig,keyring:Record<string,Buffer>,transport:typeof fetch=fetch):Promise<{kind:'found';page:AccountPageData}|{kind:'signed-out'}|{kind:'unavailable'}> {
 try{if(!isUuid(userId))throw Error();const before=decodeAccountCursor(cursor),raw=await authRpc(config,'pci_load_purchaser_account',{p_user:userId,p_before_time:before?.purchasedAt??null,p_before_id:before?.id??null},transport);if(raw.ok===false&&raw.code==='email_verification_required')return {kind:'signed-out'};return {kind:'found',page:parseAccountPage(raw,keyring)};}catch{return {kind:'unavailable'};}
}
