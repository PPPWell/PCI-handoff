import Link from 'next/link';
import {serverCouponHistory} from '@/lib/coupons/server';
import {CouponHistory,CouponToday,longDay} from '@/components/coupons/CouponHistory';
import {serverStaffFrame} from '@/lib/merchant/staff-server';
import {MerchantNav} from '@/components/merchant/MerchantNav';
import {LiveVoucherRefresh} from '@/components/vouchers/LiveVoucherRefresh';
import {MerchantUnready,StaffTopbar,restaurantName} from '@/components/merchant/StaffShell';

export default async function MerchantToday({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,restaurant=typeof params.restaurant==='string'?params.restaurant:undefined;
 const frame=await serverStaffFrame(restaurant);
 if(frame.state.kind!=='found')return <MerchantUnready {...frame.state} />;
 const data=frame.state.data,name=restaurantName(data);
 const couponCursor=typeof params.couponAt==='string'&&typeof params.couponId==='string'?{at:params.couponAt,id:params.couponId}:undefined;
 const coupons=await serverCouponHistory(data.restaurantId,couponCursor);
 const day=coupons.kind==='found'?coupons.history.date:frame.report?.date??data.date;
 return <><LiveVoucherRefresh /><StaffTopbar restaurant={name} today={frame.today} admin={frame.admin} /><main id="main-content" className="staff-page staff-today" lang="it" tabIndex={-1}>
  <h1>Oggi</h1>
  <p className="staff-lead">{longDay(day)} · ora italiana</p>
  {data.restaurants.length>1&&<nav className="staff-switch" aria-label="Scegliete il locale">{data.restaurants.map(r=><a className="text-link" key={r.id} href={'/it/merchant/today/?restaurant='+r.id} aria-current={r.id===data.restaurantId?'page':undefined}>{r.name}</a>)}</nav>}
  {frame.report?<CouponToday report={frame.report} restaurant={name} />:<p role="status">Riepilogo non disponibile. Ricaricate la pagina.</p>}
  {coupons.kind==='found'?<CouponHistory history={coupons.history} restaurant={name} now={new Date().toISOString()} />:<p role="status">Registro non disponibile. Ricaricate la pagina.</p>}
  {coupons.kind==='found'&&!coupons.history.records.length&&<Link className="button button--primary staff-action" href={'/it/merchant/scan/?restaurant='+data.restaurantId}>Scansiona un coupon</Link>}
 </main><MerchantNav restaurantId={data.restaurantId} owner={frame.role==='owner'} /></>;
}
