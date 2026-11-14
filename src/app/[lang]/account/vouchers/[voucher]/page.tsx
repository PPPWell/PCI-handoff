import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {isLocale,htmlLanguages,locales} from '@/lib/i18n';
import {ManagementScreen} from '@/components/account/ManagementScreen';
import {LiveVoucherRefresh} from '@/components/vouchers/LiveVoucherRefresh';
import {serverManagement} from '@/lib/management/server';
import {managementEnvironment} from '@/lib/management/service';
import {validatedAuthConfig} from '@/lib/auth/client';
import {managementCopy} from '@/lib/management/copy';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function generateMetadata({params}:{params:Promise<{lang:string;voucher:string}>}):Promise<Metadata>{const {lang,voucher:rawVoucher}=await params;const voucher=rawVoucher.toLowerCase();if(!isLocale(lang))notFound();return {title:managementCopy[lang].title+' | Palazzo Italia-Cina',robots:{index:false,follow:false},referrer:'no-referrer',alternates:{languages:Object.fromEntries([...locales.map(locale=>[htmlLanguages[locale],`/${locale}/account/vouchers/${encodeURIComponent(voucher)}/`]),['x-default',`/en/account/vouchers/${encodeURIComponent(voucher)}/`]])}};}
export default async function ManagementPage({params}:{params:Promise<{lang:string;voucher:string}>}){const {lang,voucher:rawVoucher}=await params;const voucher=rawVoucher.toLowerCase();if(!isLocale(lang))notFound();const state=await serverManagement(voucher),env=managementEnvironment(),config=validatedAuthConfig(env);return <><LiveVoucherRefresh /><ManagementScreen key={voucher} locale={lang} voucher={voucher} state={state} enabled={Boolean(config&&env.managementEnabled)} emailEnabled={Boolean(config?.emailEnabled)} /></>;}
