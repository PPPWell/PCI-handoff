import type{ReactNode}from "react";
import type {Locale} from '@/lib/i18n';
import type {AccountState} from '@/lib/auth/server';
import {accountCopy} from '@/lib/auth/copy';
import {EmailSignIn} from './EmailSignIn';
import {SignOut} from './SignOut';
import Link from 'next/link';
import {Icon} from '@/components/ui/Icon';

/** Signed out: one card titled "Sign in". Signed in: the personal centre — who you are, your coupons, then settings and sign out. `merchant` is set for restaurant members: one sign-in opens both the customer and the staff side. */
export function AccountScreen({locale,state,enabled,coupons,returnTo,merchant,admin}:{locale:Locale;state:AccountState;enabled:boolean;older?:boolean;coupons?:ReactNode;returnTo?:string;merchant?:{name:string|null};admin?:boolean}) {
 const c=accountCopy[locale];
 const signedOut=state.kind==='unconfigured'||state.kind==='signed-out';
 if(signedOut)return <main id="main-content" className="content-page container account-page auth-page" tabIndex={-1}>
  <div className="auth-card">
   <h1>{c.signInTitle}</h1>
   <p className="signin-lead">{c.signInLead}</p>
   <EmailSignIn locale={locale} enabled={enabled} returnTo={returnTo} bare />
  </div>
 </main>;
 const email=state.kind==='found'?state.email:null;
 return <main id="main-content" className="content-page container account-page" tabIndex={-1}>
  <header className="account-head">
   {email&&<span className="account-head__avatar" aria-hidden="true">{email.slice(0,1).toUpperCase()}</span>}
   <div><h1>{c.center}</h1>{email&&<p className="account-head__email">{email}</p>}</div>
  </header>
  {coupons??<section className="state-panel"><h2>{c.unavailable}</h2><a className="button button--secondary" href={`/${locale}/account/`}>{c.again}</a><a className="text-link" href={`/${locale}/support/`}>{c.support}</a></section>}
  {email&&<nav className="account-rows" aria-label={c.settings}>
   {merchant&&<Link href="/it/merchant/scan/" hrefLang="it"><span>{c.merchant}{merchant.name&&<span className="account-rows__detail" lang="it"> · {merchant.name}</span>}</span><Icon name="arrow" /></Link>}
   {admin&&<Link href={`/${locale}/account/stats/`}>{c.stats}<Icon name="arrow" /></Link>}
   {admin&&<Link href={`/${locale}/account/admin/`}>{c.admin}<Icon name="arrow" /></Link>}
   <a href={`/${locale}/subscribe/`}>{c.marketing}<Icon name="arrow" /></a>
   <a href={`/${locale}/help/`}>{c.helpCentre}<Icon name="arrow" /></a>
  </nav>}
  {email&&<div className="account-signout"><SignOut locale={locale} /></div>}
 </main>;
}
