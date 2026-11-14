import {redirect} from 'next/navigation';
import {EmailSignIn} from '@/components/account/EmailSignIn';
import {serverMerchantToday} from '@/lib/merchant/server';
import {serverStaffEmail,serverStaffRole} from '@/lib/merchant/staff-server';
import {MerchantUnready,StaffTopbar} from '@/components/merchant/StaffShell';

// A member who is already signed in goes straight to scanning; before that, this page is the whole staff area.
export default async function MerchantLogin(){
 const state=await serverMerchantToday();
 // A platform admin who works in no restaurant picks one instead of landing in the first.
 if(state.kind==='found')redirect(await serverStaffRole(state.data.restaurantId)?'/it/merchant/scan/?restaurant='+state.data.restaurantId:'/it/merchant/scan/');
 if(state.kind==='not-found')return <MerchantUnready kind="not-found" email={await serverStaffEmail()} />;
 return <><StaffTopbar /><main id="main-content" className="staff-page staff-login" lang="it" tabIndex={-1}>
  <h1>Accedi all’area ristorante</h1>
  <p className="staff-lead">Vi inviamo un codice di 6 cifre via email. Niente password.</p>
  <EmailSignIn locale="it" enabled={process.env.AUTH_EMAIL_ENABLED!=="false"} destination="merchant" bare />
 </main></>;
}
