import {MerchantCamera} from '@/components/merchant/MerchantCamera';
import {MerchantNav} from '@/components/merchant/MerchantNav';
import {serverStaffFrame} from '@/lib/merchant/staff-server';
import {authEnvironment,validatedAuthConfig} from '@/lib/auth/client';
import {MerchantUnready,StaffTopbar,restaurantName} from '@/components/merchant/StaffShell';

export default async function MerchantScan({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,restaurant=typeof params.restaurant==='string'?params.restaurant:undefined;
 const frame=await serverStaffFrame(restaurant),config=validatedAuthConfig(authEnvironment());
 if(frame.state.kind!=='found')return <MerchantUnready {...frame.state} />;
 const data=frame.state.data;
 return <><StaffTopbar restaurant={restaurantName(data)} today={frame.today} admin={frame.admin} /><main id="main-content" className="staff-page staff-scan" lang="it" tabIndex={-1}>
  <h1 className="sr-only">Scansiona il coupon</h1>
  <MerchantCamera origin={config?.siteOrigin??''} enabled={Boolean(config)} openCode={params.code==='1'} welcome={params.guide==='1'} restaurantId={data.restaurantId} />
 </main><MerchantNav restaurantId={data.restaurantId} owner={frame.role==='owner'} /></>;
}
