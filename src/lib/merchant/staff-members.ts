import type {NextResponse} from 'next/server';
import type {AuthConfig} from '../auth/client';
import {couponFail,couponJson,couponRequestContext,couponUserContext,exactKeys} from '../coupons/client';
import {record} from '../coupons/types';
import {isUuid} from '../vouchers/pin-types';
import {clientContext} from './server';

export interface StaffMember {email:string;active:boolean}
export const staffFailureCodes=['forbidden','invalid_request','invalid_email','staff_not_verified','owner_differs','unavailable'] as const;

export function parseStaff(v:unknown):StaffMember[]{
 const raw=record(v);if(raw.ok!==true||!Array.isArray(raw.staff))throw Error('Invalid staff list');
 return raw.staff.map(item=>{const s=record(item);if(typeof s.email!=='string'||!s.email||s.email.length>254||typeof s.active!=='boolean')throw Error('Invalid staff member');return {email:s.email,active:s.active};});
}

/** The owner's staff list for one restaurant; null when it cannot be read (the section is then left out). */
export async function serverOwnerStaff(restaurantId:string):Promise<StaffMember[]|null>{
 if(!isUuid(restaurantId))return null;
 try{const c=await clientContext();if(c.kind!=='ready')return null;const {data,error}=await c.client.rpc('pci_owner_staff',{p_restaurant:restaurantId});if(error)return null;return parseStaff(data);}catch{return null;}
}

/** Owner adds a staff email or removes it again; the database checks the owner role. */
export async function staffActionResponse(request:Request,rawConfig:AuthConfig,transport:typeof fetch=fetch){
 const ctx=await couponRequestContext(request,rawConfig);if(ctx.response)return ctx.response;const{body,config}=ctx;
 try{exactKeys(body,['restaurantId','email','active']);if(!isUuid(body.restaurantId)||typeof body.email!=='string'||body.email.length>254||typeof body.active!=='boolean')throw Error();}
 catch{return couponFail('invalid_request',400);}
 let finish:(response:NextResponse)=>NextResponse=response=>response;
 try{
  const context=await couponUserContext(request,config,transport);if(context.response)return context.response;finish=context.finish;
  const{data,error}=await context.client.rpc('pci_owner_set_staff',{p_restaurant:body.restaurantId,p_email:body.email,p_active:body.active});if(error)throw Error();
  const result=record(data);
  if(result.ok===false){const code=String(result.code);return finish(couponFail(staffFailureCodes.some(c=>c===code)?code:'unavailable',code==='forbidden'?403:code==='invalid_email'?400:409));}
  if(result.ok!==true)throw Error();
  return finish(couponJson({ok:true}));
 }catch{return finish(couponFail('unavailable'));}
}
