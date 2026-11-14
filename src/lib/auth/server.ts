import {authEnvironment,validatedAuthConfig} from './client';
import {couponContext} from '../coupons/server';
import {loadPurchaserAccount,voucherKeyring,type AccountPageData} from './account';
import {normalizedEmail} from './service';
export type AccountState={kind:'unconfigured'}|{kind:'signed-out'}|{kind:'unavailable'}|{kind:'found';email:string;page:AccountPageData};
export async function serverAccount(cursor:string|null):Promise<AccountState> {
 const config=validatedAuthConfig(authEnvironment());if(!config)return {kind:'unconfigured'};
 try{const c=await couponContext();if(c.kind!=='ready')return {kind:c.kind};
  const email=normalizedEmail(c.user.email);if(!email)return {kind:'signed-out'};
  const result=await loadPurchaserAccount(c.user.id,cursor,config,voucherKeyring(process.env));return result.kind==='found'?{...result,email}:result;
 }catch{return {kind:'unavailable'};}
}
