import type{ReactNode}from'react';import type{Metadata}from'next';import{loadServerCoupon,couponLocale}from'@/lib/coupons/server';import{htmlLanguages,locales,ui,type Locale}from'@/lib/i18n';import{Header,BottomNavigation}from'@/components/site/Header';import{Footer}from'@/components/site/Footer';import{SiteInteractions,SitePrompts}from'@/components/site/SiteInteractions';import{getHomeContent}from'@/lib/content';import{getCatalog}from'@/lib/catalog/load';import{getCatalogRoutes,makeRouteRegistry}from'@/lib/catalog/routes';import{getNavigationMode,getVisibleCategories}from'@/lib/routes';import'../../globals.css';
export const dynamic='force-dynamic';export const runtime='nodejs';export async function generateMetadata({params}:{params:Promise<{token:string}>}):Promise<Metadata>{const{token}=await params,locale=await couponLocale(await loadServerCoupon(token));const titles={zh:'优惠券 | Palazzo Italia-Cina',it:'Coupon | Palazzo Italia-Cina',en:'Coupon | Palazzo Italia-Cina'};return{title:titles[locale],robots:{index:false,follow:false},referrer:'no-referrer'};}
/** The coupon page is part of the site: same header (account, language), navigation and footer. Language switches keep the token and use ?lang=. Staff views hide all of it (.staff-shell). */
export default async function CouponLayout({children,params}:{children:ReactNode;params:Promise<{token:string}>}){
 const{token}=await params,result=await loadServerCoupon(token),locale=await couponLocale(result);
 const registry=makeRouteRegistry(getCatalogRoutes(getCatalog())),categories=getVisibleCategories(),mode=getNavigationMode(categories);
 const languageLinks=Object.fromEntries(locales.map(other=>[other,`/c/${encodeURIComponent(token)}/?lang=${other}`])) as Record<Locale,string>;
 return <html lang={htmlLanguages[locale]}><body className={mode==='bottom'?'has-bottom-nav':undefined}><a className="skip-link" href="#main-content">{ui[locale].skip}</a>
  <SiteInteractions locale={locale} bottomNavigation={mode==='bottom'} registry={registry}>
   <Header locale={locale} categories={categories} navigationMode={mode} registry={registry} languageLinks={languageLinks} />
   <SitePrompts />
   {children}
   <Footer content={getHomeContent(locale)} registry={registry} />
   {mode==='bottom'&&<BottomNavigation locale={locale} categories={categories} registry={registry} />}
  </SiteInteractions>
 </body></html>;}
