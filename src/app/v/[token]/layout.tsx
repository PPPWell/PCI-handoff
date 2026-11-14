import type { ReactNode } from "react";
import type { Metadata } from "next";
import { loadServerVoucher,voucherLocale } from "@/lib/vouchers/server";
import { htmlLanguages,languageNames,locales,ui } from "@/lib/i18n";
import { Brand } from "@/components/site/Header";
import {MerchantSessionProvider} from '@/components/merchant/MerchantSessionProvider';
import {PinSessionProvider} from "@/components/vouchers/PinSessionProvider";
import {LiveVoucherRefresh} from "@/components/vouchers/LiveVoucherRefresh";
import "../../globals.css";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const metadata:Metadata={title:"Voucher | Palazzo Italia-Cina",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function VoucherLayout({children,params}:{children:ReactNode;params:Promise<{token:string}>}) {
  const {token}=await params,result=await loadServerVoucher(token),locale=await voucherLocale(result);
  return <html lang={htmlLanguages[locale]}><body><a className="skip-link" href="#main-content">{ui[locale].skip}</a><header className="fallback-header container"><Brand locale={locale} /><nav aria-label={ui[locale].language}>{locales.map(other=><a key={other} href={`/v/${encodeURIComponent(token)}/?lang=${other}`} lang={htmlLanguages[other]} aria-current={other===locale?"page":undefined} rel="noreferrer">{languageNames[other]}</a>)}</nav><a className="text-link" href={`/${locale}/account/`}>{ui[locale].login}</a></header><MerchantSessionProvider key={token}><PinSessionProvider key={token} initialBatch={result.kind==="found"?result.view.lastPinBatch??null:null}><LiveVoucherRefresh />{children}</PinSessionProvider></MerchantSessionProvider><footer className="container voucher-footer"><a className="text-link" href={`/${locale}/help/`}>{ui[locale].help}</a><a className="text-link" href={`/${locale}/support/`}>{ui[locale].support}</a><a className="text-link" href={`/${locale}/legal/`}>{ui[locale].terms}</a></footer></body></html>;
}
