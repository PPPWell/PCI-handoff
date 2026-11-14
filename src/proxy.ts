import {authEnvironment,validatedAuthConfig} from "./lib/auth/client";
import {refreshAccountSession} from "./lib/auth/proxy";
import { fallbackLocale } from "./lib/states/routes";
import { NextResponse, type NextRequest } from "next/server";
import { requestPrivacyHeaders } from "@/lib/catalog/seo";
import { isLocale } from "@/lib/i18n";
import { readDiscountCoupon } from "@/lib/coupons/service";
import { readVoucher } from "@/lib/vouchers/read";

export async function proxy(request: NextRequest) {
  const headers=new Headers(request.headers),value=request.nextUrl.searchParams.get("lang"),voucherLocale=/^\/(?:v|c)\//.test(request.nextUrl.pathname)&&value&&isLocale(value)?value:"";
  headers.set("x-pci-locale",voucherLocale||fallbackLocale(request.nextUrl.pathname));headers.set("x-pci-voucher-locale",voucherLocale);
  const offlineAsset=['/v/offline-worker.js','/v/offline-engine.js','/v/offline-core.js','/v/offline-browser.js','/v/offline-client.js','/v/offline.css'].includes(request.nextUrl.pathname);
  const match=offlineAsset?null:request.nextUrl.pathname.match(/^\/(v|c)\/([^/]+)\/?$/);
  let missing=false;
  if(match){
    try{missing=(await (match[1] === "c" ? readDiscountCoupon : readVoucher)(decodeURIComponent(match[2]),{url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY})).kind==="not-found";}catch{missing=true;}
  }
  // Next's notFound() currently emits an empty SSR shell for dynamic pages (#99793).
  // Route misses through global-not-found before rendering; never forward the token to the rewrite.
  // A locale prefix also survives Next's loopback-host normalization / rewrite re-entry.
  const authConfig=!offlineAsset&&/^(?:\/(zh|it|en)\/(?:account|merchant|claim|subscribe)(?:\/|$)|\/(?:v|c)\/)/.test(request.nextUrl.pathname)?validatedAuthConfig(authEnvironment()):null;
  const response=missing?NextResponse.rewrite(new URL(`/${voucherLocale||"zh"}/-/voucher-not-found/`,request.url),{status:404,request:{headers}}):authConfig?await refreshAccountSession(request,headers,authConfig):NextResponse.next({request:{headers}});
  for (const [key, value] of Object.entries(requestPrivacyHeaders(request.nextUrl))) response.headers.set(key, value);
  return response;
}
export const config = { matcher: ["/((?!_next|api|fonts|icon.svg).*)"] };
