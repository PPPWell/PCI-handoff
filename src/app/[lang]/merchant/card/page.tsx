import QRCode from 'qrcode';
import {redirect} from 'next/navigation';
import {serverStaffFrame} from '@/lib/merchant/staff-server';
import {MerchantUnready,StaffTopbar,restaurantName} from '@/components/merchant/StaffShell';
import {MerchantNav} from '@/components/merchant/MerchantNav';
import {StaffCard} from '@/components/merchant/StaffCard';

/** Owner-only printable card for the counter: how to redeem in four lines, with a QR that opens scanning. */
export default async function MerchantCard({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,restaurant=typeof params.restaurant==='string'?params.restaurant:undefined;
 const frame=await serverStaffFrame(restaurant);
 if(frame.state.kind!=='found')return <MerchantUnready {...frame.state} />;
 const data=frame.state.data;
 if(frame.role!=='owner')redirect('/it/merchant/scan/?restaurant='+data.restaurantId);
 let qr:string|null=null;try{const origin=new URL(process.env.SITE_ORIGIN??'');qr=await QRCode.toDataURL(new URL('/it/merchant/scan/',origin).href,{errorCorrectionLevel:'M',margin:2,width:320});}catch{qr=null;}
 return <><StaffTopbar restaurant={restaurantName(data)} today={frame.today} admin={frame.admin} /><main id="main-content" className="staff-page staff-card-page" lang="it" tabIndex={-1}>
  <h1>Scheda per lo staff</h1>
  <p className="staff-lead">Stampatela e tenetela vicino alla cassa.</p>
  <StaffCard restaurant={restaurantName(data)} qr={qr} />
 </main><MerchantNav restaurantId={data.restaurantId} owner /></>;
}
