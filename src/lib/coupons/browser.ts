import {randomUuidV4} from '../polyfills';
import{parseCouponView,record,type OwnedCoupon}from'./types';
export function parseClaimResult(value:unknown,campaign:string):OwnedCoupon&{path:string}{const raw=record(value),view=parseCouponView(raw);if(view.coupon.campaignId!==campaign||typeof raw.path!=='string'||!/^\/c\/[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]\/$/.test(raw.path))throw Error('Invalid claimed coupon');return{...view,path:raw.path};}
const key=(campaign:string)=>'pci:discount-request:'+campaign;
export function claimRequestId(campaign:string):string{try{const existing=sessionStorage.getItem(key(campaign));if(existing&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(existing))return existing;}catch{/* Memory retry remains available when storage is blocked. */}const id=randomUuidV4();try{sessionStorage.setItem(key(campaign),id);}catch{/* Never turn storage failure into a false successful claim. */}return id;}
export function clearClaimRequest(campaign:string,id:string){try{if(sessionStorage.getItem(key(campaign))===id)sessionStorage.removeItem(key(campaign));}catch{/* Optional retry continuity only. */}}

/** A definitive conflict proves this identity/locale did not commit the stored request. */
export function claimRequestAfterFailure(campaign:string,id:string,code:string):string|null{if(code==='request_conflict'){clearClaimRequest(campaign,id);return null;}return id;}
