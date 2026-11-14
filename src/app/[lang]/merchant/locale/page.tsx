import Link from 'next/link';
import {SignOut} from '@/components/account/SignOut';
import {serverStaffEmail,serverStaffFrame} from '@/lib/merchant/staff-server';
import {MerchantNav} from '@/components/merchant/MerchantNav';
import {MerchantStaff} from '@/components/merchant/MerchantStaff';
import {serverOwnerStaff} from '@/lib/merchant/staff-members';
import {CouponReport} from '@/components/coupons/CouponReport';
import {MerchantUnready,StaffTopbar,restaurantName} from '@/components/merchant/StaffShell';

/** Third tab. Owners: month, phones, staff, materials. Everyone: the guide again, help and the account with sign-out. */
export default async function MerchantLocale({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,restaurant=typeof params.restaurant==='string'?params.restaurant:undefined;
 const frame=await serverStaffFrame(restaurant);
 if(frame.state.kind!=='found')return <MerchantUnready {...frame.state} />;
 const data=frame.state.data,query='?restaurant='+data.restaurantId;
 const owner=frame.role==='owner';
 const [email,staff]=await Promise.all([serverStaffEmail(),owner?serverOwnerStaff(data.restaurantId):null]);
 const help=<>
  <section className="staff-group" aria-labelledby="locale-help">
   <h2 id="locale-help">Aiuto</h2>
   <Link className="staff-row" href={'/it/merchant/scan/'+query+'&guide=1'}><span>Guida rapida</span><small>Come si convalida, app e fotocamera</small></Link>
   <a className="staff-row" href="mailto:info@palazzoitaliacina.com"><span>Scriveteci</span><small>info@palazzoitaliacina.com</small></a>
   <Link className="staff-row" href={'/it/merchant/help/'+query}><span>Domande frequenti</span><small>Convalide, errori, staff e telefoni</small></Link>
  </section>
  <section className="staff-group" aria-labelledby="locale-account">
   <h2 id="locale-account">Account</h2>
   {email&&<p className="staff-row staff-row--static"><span>{email}</span><small>{owner?'Titolare':frame.admin?'Amministratore della piattaforma':'Staff'}</small></p>}
   {frame.admin&&<Link className="staff-row" href="/it/merchant/scan/"><span>Cambia locale</span><small>Torna all’elenco dei locali</small></Link>}
   {/* The console is a page of the main site: it opens beside the restaurant area, which stays where it was. */}
   {frame.admin&&<a className="staff-row" href="/zh/account/admin/" target="_blank" rel="noopener"><span>Console di amministrazione</span><small>Si apre in una nuova finestra</small></a>}
   <SignOut locale="it" redirectTo="/it/merchant/login/" />
  </section>
 </>;
 if(!owner)return <><StaffTopbar restaurant={restaurantName(data)} today={frame.today} admin={frame.admin} /><main id="main-content" className="staff-page staff-locale" lang="it" tabIndex={-1}>
  <h1>Account</h1>
  {help}
 </main><MerchantNav restaurantId={data.restaurantId} /></>;
 return <><StaffTopbar restaurant={restaurantName(data)} today={frame.today} admin={frame.admin} /><main id="main-content" className="staff-page staff-locale" lang="it" tabIndex={-1}>
  <h1>Locale</h1>
  {frame.report&&<CouponReport report={frame.report} restaurant={restaurantName(data)} />}
  <section className="staff-group" aria-labelledby="locale-phones">
   <h2 id="locale-phones">Telefoni</h2>
   <Link className="staff-row" href={'/it/merchant/devices/'+query}><span>Telefoni collegati</span><small>Chi può convalidare i coupon</small></Link>
  </section>
  {staff&&<section className="staff-group" aria-labelledby="locale-staff">
   <h2 id="locale-staff">Staff</h2>
   <MerchantStaff restaurantId={data.restaurantId} staff={staff} />
  </section>}
  <section className="staff-group" aria-labelledby="locale-materials">
   <h2 id="locale-materials">Materiali</h2>
   <Link className="staff-row" href={'/it/merchant/card/'+query}><span>Scheda per lo staff</span><small>Da stampare e tenere alla cassa</small></Link>
  </section>
  {help}
 </main><MerchantNav restaurantId={data.restaurantId} owner /></>;
}
