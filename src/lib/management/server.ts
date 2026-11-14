import {cookies} from 'next/headers';
import {authRpc,createAuthClient,validatedAuthConfig} from '../auth/client';
import {isUuid} from '../vouchers/pin-types';
import {managementEnvironment} from './service';
import {parseManagementView,type ManagementView} from './types';
export type ManagementPageState={kind:'unconfigured'|'signed-out'|'not-found'|'unavailable'}|{kind:'found';view:ManagementView};
export async function serverManagement(voucher:string):Promise<ManagementPageState>{
 if(!isUuid(voucher))return {kind:'not-found'};voucher=voucher.toLowerCase();const config=validatedAuthConfig(managementEnvironment());if(!config)return {kind:'unconfigured'};
 try{const store=await cookies(),client=createAuthClient(config,{getAll:()=>store.getAll(),setAll:()=>{/* Account proxy refreshes before RSC. */}}),identity=await client.auth.getUser();if(identity.error)return {kind:identity.error.name==='AuthSessionMissingError'||identity.error.status===401||identity.error.status===403?'signed-out':'unavailable'};const user=identity.data.user;if(!user||!isUuid(user.id)||!user.email_confirmed_at)return {kind:'signed-out'};
 const raw=await authRpc(config,'pci_read_purchaser_voucher',{p_user:user.id,p_voucher:voucher});if(raw.ok===false&&raw.code==='not_found')return {kind:'not-found'};const view=parseManagementView(raw);if(view.voucherId!==voucher)throw Error();return {kind:'found',view};
 }catch{return {kind:'unavailable'};}
}
