import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {isLocale} from '@/lib/i18n';
import {getCatalog} from '@/lib/catalog/load';
import {getCatalogRoutes,makeRouteRegistry} from '@/lib/catalog/routes';
import {pageMetadata,siteOrigin} from '@/lib/catalog/seo';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function generateMetadata({params}:{params:Promise<{lang:string}>}):Promise<Metadata>{const {lang}=await params;if(!isLocale(lang))notFound();const catalog=getCatalog(),routes=getCatalogRoutes(catalog),route=routes.find(r=>r.locale===lang&&r.experiencePage==='verify')!;return {...pageMetadata(route,catalog,makeRouteRegistry(routes),siteOrigin()),referrer:'no-referrer'};}
// The legacy verification URL uses the same active login and coupon wallet as account.
export {default} from '../page';
