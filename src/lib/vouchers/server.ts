import { cache } from "react";
import { headers } from "next/headers";
import { isLocale,type Locale } from "../i18n";
import { readVoucher,type VoucherReadResult } from "./read";
/** React cache lasts only for the current server render, not across voucher requests. */
export const loadServerVoucher=cache((token:string)=>readVoucher(token,{url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY}));
export async function voucherLocale(result:VoucherReadResult):Promise<Locale> {
  const value=(await headers()).get("x-pci-voucher-locale");return value&&isLocale(value)?value:result.kind==="found"?result.view.language:"zh";
}
