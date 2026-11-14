import {cache} from 'react';
import {clientContext,serverMerchantToday} from './server';
import {serverCouponReport} from '../coupons/server';
import {isUuid} from '../vouchers/pin-types';
import {todayTotal} from './today';

export type StaffRole='owner'|'staff';

/** The signed-in member's own role at one restaurant. Row security only lets a member read their own row (owners read all), so the user id filter is required. */
export const serverStaffRole=cache(async(restaurantId:string):Promise<StaffRole|null>=>{
 if(!isUuid(restaurantId))return null;
 try{const c=await clientContext();if(c.kind!=='ready')return null;
  const {data,error}=await c.client.from('pci_restaurant_members').select('role').eq('restaurant_id',restaurantId).eq('user_id',c.user.id).eq('active',true).maybeSingle();
  if(error||!data)return null;return data.role==='owner'?'owner':data.role==='staff'?'staff':null;}catch{return null;}
});

/** Whether the signed-in person works at any restaurant: a staff phone scanning another restaurant's coupon gets a staff answer, not the customer page. */
export const serverIsStaffAnywhere=cache(async():Promise<boolean>=>{
 try{const c=await clientContext();if(c.kind!=='ready')return false;
  const {data,error}=await c.client.from('pci_restaurant_members').select('restaurant_id').eq('user_id',c.user.id).eq('active',true).limit(1);
  return !error&&Array.isArray(data)&&data.length>0;}catch{return false;}
});

/** The signed-in email, for the account line in Locale and the "no restaurant" notice. */
export const serverStaffEmail=cache(async():Promise<string|null>=>{try{const c=await clientContext();return c.kind==='ready'?c.user.email||null:null;}catch{return null;}});

/** Everything the staff frame needs on each page: which restaurant, the member's role and today's count for the top bar.
 * Only a platform admin passes the database check without being a member (the spec lets the admin help a restaurant with
 * manual redemptions). An admin is never dropped into the first restaurant: without an explicit choice they get a picker,
 * and a chosen restaurant is marked as admin mode. */
export async function serverStaffFrame(restaurant?:string){
 const state=await serverMerchantToday(restaurant);
 if(state.kind!=='found')return {state,role:null,admin:false,today:null} as const;
 const [role,report]=await Promise.all([serverStaffRole(state.data.restaurantId),serverCouponReport(state.data.restaurantId)]);
 if(!role&&!restaurant)return {state:{kind:'admin' as const,restaurants:state.data.restaurants},role:null,admin:true,today:null} as const;
 return {state,role,admin:!role,today:report.kind==='found'?todayTotal(report.report):null,report:report.kind==='found'?report.report:null} as const;
}
