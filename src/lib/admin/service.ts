import type {NextResponse} from 'next/server';
import type {AuthConfig} from '../auth/client';
import type {Catalog} from '../catalog/types';
import {couponFail,couponJson,couponRequestContext,couponUserContext,exactKeys} from '../coupons/client';
import {record} from '../coupons/types';
import {adminFailureCodes,setupPayload} from './console';
import {isUuid} from '../vouchers/pin-types';

const failure=(code:string)=>couponFail(code,code==='forbidden'?403:code==='invalid_request'||code==='invalid_email'?400:code==='not_found'?404:code==='unavailable'?503:409);

/** Admin console writes: open a content campaign for its restaurant, pause / resume one, or hand a restaurant to a new
 * owner. The database checks the admin role. */
export async function adminActionResponse(request:Request,rawConfig:AuthConfig,catalog:Catalog,transport:typeof fetch=fetch){
 const ctx=await couponRequestContext(request,rawConfig);if(ctx.response)return ctx.response;const{body,config}=ctx;
 let name:string,args:Record<string,unknown>;
 try{
  if(body.action==='setup'){exactKeys(body,['action','campaignId','ownerEmail']);if(typeof body.campaignId!=='string'||typeof body.ownerEmail!=='string'||body.ownerEmail.length>254)throw Error();
   const payload=setupPayload(catalog,body.campaignId,body.ownerEmail);if(!payload)return failure('not_found');name='pci_admin_setup_campaign';args={p:payload};}
  else if(body.action==='status'){exactKeys(body,['action','campaignId','status']);if(typeof body.campaignId!=='string'||(body.status!=='active'&&body.status!=='paused'))throw Error();
   name='pci_admin_set_campaign_status';args={p_campaign:body.campaignId,p_status:body.status};}
  else if(body.action==='owner'){exactKeys(body,['action','restaurantId','ownerEmail']);if(!isUuid(body.restaurantId)||typeof body.ownerEmail!=='string'||body.ownerEmail.length>254)throw Error();
   name='pci_admin_transfer_owner';args={p_restaurant:body.restaurantId,p_email:body.ownerEmail.trim().toLowerCase()};}
  else throw Error();
 }catch{return couponFail('invalid_request',400);}
 let finish:(response:NextResponse)=>NextResponse=response=>response;
 try{
  const context=await couponUserContext(request,config,transport);if(context.response)return context.response;finish=context.finish;
  const{data,error}=await context.client.rpc(name,args);if(error)throw Error();
  const result=record(data);
  if(result.ok===false){const code=String(result.code);return finish(failure(adminFailureCodes.some(c=>c===code)?code:'unavailable'));}
  if(result.ok!==true)throw Error();
  return finish(couponJson({ok:true,invited:result.invited===true}));
 }catch{return finish(couponFail('unavailable'));}
}
