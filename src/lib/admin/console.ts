import type {Catalog} from '../catalog/types';
import {couponTranslations} from '../coupons/ux';
import {isUuid} from '../vouchers/pin-types';

export interface AdminCampaign {id:string;status:'active'|'paused';discountCents:number;validityMonths?:number;validityDays?:number;version:number}
export interface AdminRestaurant {id:string;placeId:string;name:string;status:string;owners:string[];/** Email invited as owner who has not signed in yet. */invite?:string;campaigns:AdminCampaign[]}
export type AdminOverviewState={kind:'found';restaurants:AdminRestaurant[]}|{kind:'forbidden'|'signed-out'|'unconfigured'|'unavailable'};
/** A coupon menu in the repository content that the console can open for its restaurant. */
export interface ContentCampaign {campaignId:string;placeId:string;restaurant:string;menu:string;discountCents:number;validityMonths?:number;validityDays?:number;version:number}

function invalid():never{throw Error('Invalid admin overview');}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();return v as Record<string,unknown>;}
function text(v:unknown,max=254){if(typeof v!=='string'||!v.trim()||v.length>max)invalid();return v;}
function count(v:unknown){if(typeof v!=='number'||!Number.isInteger(v)||v<0)invalid();return v;}

export function parseAdminOverview(v:unknown):AdminRestaurant[]{
 const raw=object(v);if(raw.ok!==true||!Array.isArray(raw.restaurants))invalid();
 return raw.restaurants.map(item=>{const r=object(item);if(!isUuid(r.id)||!Array.isArray(r.owners)||!Array.isArray(r.campaigns))invalid();
  return {id:String(r.id),placeId:text(r.placeId,100),name:text(r.name,200),status:text(r.status,20),owners:r.owners.map(o=>text(o)),...(r.invite===undefined||r.invite===null?{}:{invite:text(r.invite)}),
   campaigns:r.campaigns.map(entry=>{const c=object(entry);if(c.status!=='active'&&c.status!=='paused')invalid();return {id:text(c.id,100),status:c.status,discountCents:count(c.discountCents),...(c.validityMonths!==undefined?{validityMonths:count(c.validityMonths)}:{}),...(c.validityDays!==undefined?{validityDays:count(c.validityDays)}:{}),version:count(c.version)};})};});
}

/** Coupon menus on sale in the content files; the console only opens what the content defines, never a campaign of its own. */
export function contentCampaigns(catalog:Catalog):ContentCampaign[]{
 return catalog.offers.filter(o=>o.benefit&&o.status==='on-sale'&&o.salesMode==='pay-at-restaurant').flatMap(o=>{
  const place=catalog.places.find(p=>p.id===o.placeId);if(!place)return [];
  return [{campaignId:o.benefit!.campaignId,placeId:place.id,restaurant:place.translations.it.name,menu:o.translations.zh.courses[0]?.name??o.translations.zh.name,discountCents:o.benefit!.discountCents,...(o.validityDays?{validityDays:o.validityDays}:{validityMonths:o.validityMonths}),version:o.version}];
 });
}

/** The exact payload pci_admin_setup_campaign expects, built from content on the server. */
export function setupPayload(catalog:Catalog,campaignId:string,ownerEmail:string){
 const offer=catalog.offers.find(o=>o.benefit?.campaignId===campaignId&&o.status==='on-sale'&&o.salesMode==='pay-at-restaurant');
 const place=offer&&catalog.places.find(p=>p.id===offer.placeId);
 if(!offer||!place)return null;
 return {ownerEmail:ownerEmail.trim().toLowerCase(),placeId:place.id,name:place.translations.it.name,campaignId,version:offer.version,discountCents:offer.benefit!.discountCents,...(offer.validityDays?{validityDays:offer.validityDays}:{validityMonths:offer.validityMonths}),translations:couponTranslations(offer)};
}

export const adminFailureCodes=['forbidden','invalid_request','invalid_email','owner_not_verified','restaurant_differs','owner_differs','campaign_differs','not_found','unavailable'] as const;
export type AdminFailure=typeof adminFailureCodes[number];
