import {VoucherOfflineCustomer,VoucherOfflineInvalidation} from '@/components/vouchers/VoucherOfflineCustomer';
import {makeOfflineSnapshot} from '@/lib/vouchers/offline-core';
import { loadServerVoucher,voucherLocale } from "@/lib/vouchers/server";
import { makeVoucherQr } from "@/lib/vouchers/qr";
import { getCatalog } from "@/lib/catalog/load";
import { LiveVoucherPage } from "@/components/vouchers/LiveVoucherPage";
import { StatePanel } from "@/components/states/StatePanel";
import {serverMerchantVoucher} from '@/lib/merchant/server';
import {MerchantScreen} from '@/components/merchant/MerchantScreen';
import {MerchantVoucherGate} from '@/components/merchant/MerchantVoucherGate';
export default async function VoucherPage({params}:{params:Promise<{token:string}>}) {
  const {token}=await params,result=await loadServerVoucher(token),locale=await voucherLocale(result);
  // A revocation between the proxy preflight and this fresh read must still show an error, never an old code.
  if(result.kind==="not-found")return <MerchantVoucherGate token={token} state={{kind:"not-found"}}><><VoucherOfflineInvalidation /><StatePanel locale={locale} variant="missing" /></></MerchantVoucherGate>;
  if(result.kind==="unavailable")return <MerchantVoucherGate token={token} state={{kind:"unavailable"}}><StatePanel locale={locale} variant="maintenance" /></MerchantVoucherGate>;
  const merchant=await serverMerchantVoucher(token);if(merchant.kind==='found')return <MerchantScreen token={token} state={merchant} />;
  const qr=await makeVoucherQr(token,result.view,process.env.SITE_ORIGIN),place=getCatalog().places.find(place=>place.id===result.view.restaurant.placeId);
  return <MerchantVoucherGate token={token} state={merchant}><VoucherOfflineCustomer locale={locale} snapshot={makeOfflineSnapshot(result.view,qr?.dataUrl??null)}><LiveVoucherPage view={result.view} token={token} locale={locale} qrDataUrl={qr?.dataUrl??null} place={place?.status==="published"?place:undefined} /></VoucherOfflineCustomer></MerchantVoucherGate>;
}
