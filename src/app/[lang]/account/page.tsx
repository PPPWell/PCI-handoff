import {serverCouponWallet}from '@/lib/coupons/server';
import {CouponWallet}from '@/components/coupons/CouponWallet';
import type {Metadata} from 'next';
import {couponReturnPath}from '@/lib/coupons/return-path';
import {notFound} from 'next/navigation';
import {isLocale} from '@/lib/i18n';
import {AccountScreen} from '@/components/account/AccountScreen';
import {serverAccount} from '@/lib/auth/server';
import {serverIsStaffAnywhere} from '@/lib/merchant/staff-server';
import {serverMerchantToday} from '@/lib/merchant/server';
import {serverIsPlatformAdmin} from '@/lib/admin/server';
import {getCatalog} from '@/lib/catalog/load';
import {getCatalogRoutes,makeRouteRegistry} from '@/lib/catalog/routes';
import {pageMetadata,siteOrigin} from '@/lib/catalog/seo';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function generateMetadata({params}:{params:Promise<{lang:string}>}):Promise<Metadata>{const {lang}=await params;if(!isLocale(lang))notFound();const catalog=getCatalog(),routes=getCatalogRoutes(catalog),route=routes.find(r=>r.locale===lang&&r.experiencePage==='account')!;return {...pageMetadata(route,catalog,makeRouteRegistry(routes),siteOrigin()),referrer:'no-referrer'};}
export default async function AccountPage({params,searchParams}:{params:Promise<{lang:string}>;searchParams:Promise<{before?:string|string[];couponsBefore?:string|string[];next?:string|string[]}>}) {
 const {lang}=await params;if(!isLocale(lang))notFound();const search=await searchParams,cursor=typeof search.before==='string'?search.before:null;
 // One sign-in check is shared (cached per request), so the account, wallet, staff and admin reads can all start together.
 const [state,coupons,staff,admin]=await Promise.all([Array.isArray(search.before)?Promise.resolve({kind:'unavailable' as const}):serverAccount(cursor),serverCouponWallet(typeof search.couponsBefore==='string'?search.couponsBefore:null),serverIsStaffAnywhere(),serverIsPlatformAdmin()]);
 const merchant=staff?await merchantName():undefined;
 return <AccountScreen locale={lang} state={state} enabled={process.env.AUTH_EMAIL_ENABLED!=="false"} older={cursor!==null} merchant={merchant} admin={admin} returnTo={couponReturnPath(typeof search.next==="string"?search.next:undefined,lang)} coupons={coupons.kind==="found"?<CouponWallet wallet={coupons.wallet} locale={lang} />:coupons.kind==="unavailable"&&(state.kind==="found"||state.kind==="unavailable")?<CouponWallet wallet={null} locale={lang} />:undefined} />;
}

/** The restaurant name for the merchant row; several restaurants (or an unreadable list) show the row without a name. */
async function merchantName():Promise<{name:string|null}>{const today=await serverMerchantToday();return {name:today.kind==='found'&&today.data.restaurants.length===1?today.data.restaurants[0].name:null};}
