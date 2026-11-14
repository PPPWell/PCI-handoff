import {parsePinResult,type PinBatch} from "./pin-types";
import type { Locale } from "../i18n";
import { isLocale } from "../i18n";
import { hashVoucherToken } from "./tokens";
import { romeDate } from "./reservation";
export type VoucherStatus="unused"|"extended"|"redeemed"|"withdrawn"|"refunded"|"expired";
export interface VoucherMenuCopy {name:string|null;summary:string|null;conditions:string|null;allergens:string|null;courses:{name:string;description:string}[]}
export interface VoucherItem {id:string;status:VoucherStatus;expiresOn:string;purchasedAt:string;extendedOnce:boolean;redeemedAt:string|null;usable:boolean;shortCode:string|null;refundStatus:"pending"|"processing"|"failed"|null;withdrawalWindowOpen:boolean;extensionAvailable:boolean}
export interface VoucherView {version:1;language:Locale;salesMode:"prepaid"|"pay-at-restaurant";serverNow:string;scope:"order"|"voucher";restaurant:{id:string;name:string;placeId:string};menu:{version:number;people:number;translations:Record<Locale,VoucherMenuCopy>};vouchers:VoucherItem[];lastPinBatch?:PinBatch|null}
export type VoucherReadResult={kind:"found";view:VoucherView}|{kind:"not-found"}|{kind:"unavailable"};
type Obj=Record<string,unknown>;
function invalid():never {throw new Error("Invalid voucher data");}
function object(value:unknown):Obj {if(!value||typeof value!=="object"||Array.isArray(value))invalid();return value as Obj;}
function string(value:unknown,max=500):string {if(typeof value!=="string"||!value.trim()||value.length>max)invalid();return value;}
function nullableString(value:unknown,max=5000):string|null {return value===null?null:string(value,max);}
function bool(value:unknown):boolean {if(typeof value!=="boolean")invalid();return value;}
function integer(value:unknown,max:number) {if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>max)invalid();return Number(value);}
function uuid(value:unknown) {const id=string(value,36);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))invalid();return id;}
function date(value:unknown) {const day=string(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)invalid();return day;}
function timestamp(value:unknown) {const time=string(value,64);date(time.slice(0,10));if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(time)||!Number.isFinite(Date.parse(time)))invalid();return time;}
function menuCopy(value:unknown):VoucherMenuCopy {
  const copy=object(value);if(!Array.isArray(copy.courses)||copy.courses.length>100)invalid();
  return {name:nullableString(copy.name,500),summary:nullableString(copy.summary),conditions:nullableString(copy.conditions),allergens:nullableString(copy.allergens),courses:copy.courses.map(value=>{const course=object(value);return {name:string(course.name,500),description:string(course.description,5000)};})};
}
/** Rebuild an explicit display DTO: unexpected provider fields are never forwarded to the browser. */
export function parseVoucherView(value:unknown):VoucherView {
  const raw=object(value),restaurant=object(raw.restaurant),menu=object(raw.menu),translations=object(menu.translations),serverNow=timestamp(raw.serverNow),today=romeDate(new Date(serverNow));
  if(raw.version!==1||!isLocale(String(raw.language))||!(raw.salesMode==="prepaid"||raw.salesMode==="pay-at-restaurant")||!(raw.scope==="order"||raw.scope==="voucher")||!Array.isArray(raw.vouchers)||raw.vouchers.length<1||raw.vouchers.length>6||raw.scope==="voucher"&&raw.vouchers.length!==1)invalid();
  const vouchers:VoucherItem[]=raw.vouchers.map(value=>{
    const row=object(value),status=string(row.status),expiresOn=date(row.expiresOn),purchasedAt=timestamp(row.purchasedAt),redeemedAt=row.redeemedAt===null?null:timestamp(row.redeemedAt),usable=bool(row.usable),extendedOnce=bool(row.extendedOnce),withdrawalWindowOpen=bool(row.withdrawalWindowOpen),extensionAvailable=bool(row.extensionAvailable),shortCode=nullableString(row.shortCode,9),refundStatus=row.refundStatus;
    if(!["unused","extended","redeemed","withdrawn","refunded","expired"].includes(status)||!(refundStatus===null||refundStatus==="pending"||refundStatus==="processing"||refundStatus==="failed"))invalid();
    if(usable&&(!["unused","extended"].includes(status)||expiresOn<today||refundStatus==="processing")||usable!==(shortCode!==null)||shortCode!==null&&!/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(shortCode))invalid();
    if((status==="redeemed")!==(redeemedAt!==null)||status==="extended"&&!extendedOnce||status==="unused"&&extendedOnce||withdrawalWindowOpen&&extensionAvailable||(withdrawalWindowOpen||extensionAvailable)&&(!usable||status!=="unused"||refundStatus==="pending"))invalid();
    return {id:uuid(row.id),status:status as VoucherStatus,expiresOn,purchasedAt,extendedOnce,redeemedAt,usable,shortCode,refundStatus,withdrawalWindowOpen,extensionAvailable};
  });
  if(new Set(vouchers.map(v=>v.id)).size!==vouchers.length)invalid();
  const lastPinBatch=raw.lastPinBatch==null?null:parsePinResult(raw.lastPinBatch);if(lastPinBatch&&(!lastPinBatch.ok||lastPinBatch.undoneAt!==null))invalid();
  return {lastPinBatch:lastPinBatch as PinBatch|null,version:1,language:raw.language as Locale,salesMode:raw.salesMode,serverNow,scope:raw.scope,restaurant:{id:uuid(restaurant.id),name:string(restaurant.name,500),placeId:string(restaurant.placeId,200)},menu:{version:integer(menu.version,2147483647),people:integer(menu.people,100),translations:{zh:menuCopy(translations.zh),it:menuCopy(translations.it),en:menuCopy(translations.en)}},vouchers};
}
export async function readVoucher(token:string,config:{url?:string;secretKey?:string},transport:typeof fetch=fetch):Promise<VoucherReadResult> {
  let hash:string;try{hash=hashVoucherToken(token);}catch{return {kind:"not-found"};}
  try {
    const origin=new URL(config.url??"");if(origin.protocol!=="https:"||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash||!/^sb_secret_[A-Za-z0-9_-]+$/.test(config.secretKey??""))throw new Error();
    const response=await transport(new URL("/rest/v1/rpc/pci_read_voucher_capability",origin),{method:"POST",headers:{apikey:config.secretKey!,"Content-Type":"application/json"},body:JSON.stringify({p_token_hash:hash}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error();const text=await response.text();if(text.length>1024*1024)throw new Error();const value:unknown=JSON.parse(text);
    return value===null?{kind:"not-found"}:{kind:"found",view:parseVoucherView(value)};
  }catch{return {kind:"unavailable"};}
}
