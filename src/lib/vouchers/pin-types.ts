/** Shared allowlist for server responses and the PIN fallback UI; no credentials or token helpers. */
export interface PinBatch {ok:true;code:'redeemed'|'already_redeemed'|'undone'|'already_undone';batchId:string;quantity:number;redeemedAt:string;undoUntil:string;serverNow:string;undoneAt:string|null}
export const pinFailureCodes=['not_found','invalid_request','invalid_selection','incorrect_pin','invalid_pin','pin_locked','pin_not_configured','request_conflict','state_changed','undo_window_closed','not_current','unavailable'] as const;
export type PinFailureCode=typeof pinFailureCodes[number];
export interface PinFailure {ok:false;code:PinFailureCode;attemptsRemaining?:number;retryAt?:string}
export type PinResult=PinBatch|PinFailure;
export const isUuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function invalid():never {throw new Error('Invalid PIN response');}
function time(value:unknown):string {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value.slice(0,10)).toISOString().slice(0,10)!==value.slice(0,10))invalid();return value;}
export function parsePinResult(value:unknown):PinResult {
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();const v=value as Record<string,unknown>;
 if(v.ok===false){if(!pinFailureCodes.includes(v.code as PinFailureCode))invalid();const result:PinFailure={ok:false,code:v.code as PinFailureCode};
  const attempts=v.attemptsRemaining??v.attempts_remaining,retry=v.retryAt??v.retry_at;
  if(result.code==='incorrect_pin'){if(!Number.isInteger(attempts)||Number(attempts)<0||Number(attempts)>4)invalid();result.attemptsRemaining=Number(attempts);}
  if(result.code==='pin_locked')result.retryAt=time(retry);
  return result;
 }
 if(v.ok!==true||!['redeemed','already_redeemed','undone','already_undone'].includes(String(v.code))||!isUuid(v.batchId)||!Number.isInteger(v.quantity)||Number(v.quantity)<1||Number(v.quantity)>6)invalid();
 const redeemedAt=time(v.redeemedAt),undoUntil=time(v.undoUntil),serverNow=time(v.serverNow),undoneAt=v.undoneAt===null?null:time(v.undoneAt);
 if(Date.parse(undoUntil)-Date.parse(redeemedAt)!==120000||Date.parse(serverNow)<Date.parse(redeemedAt)||(v.code==='undone'||v.code==='already_undone')!==(undoneAt!==null)||undoneAt!==null&&(Date.parse(undoneAt)<Date.parse(redeemedAt)||Date.parse(undoneAt)>Date.parse(serverNow)))invalid();
 return {ok:true,code:v.code as PinBatch['code'],batchId:v.batchId,quantity:Number(v.quantity),redeemedAt,undoUntil,serverNow,undoneAt};
}
