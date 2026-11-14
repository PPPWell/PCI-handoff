import { NextResponse, type NextRequest } from "next/server";
import { getCatalog } from "@/lib/catalog/load";
import { getCatalogRoutes, makeRouteRegistry, pathFor } from "@/lib/catalog/routes";
import { isAutomated, isExpired, parseGoPath, pickLocale, recordGoScan } from "@/lib/go/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Temporary redirect that no cache may keep: the target and the language both change from one visit to the next.
const headers = { "Cache-Control": "private, no-store", Vary: "Accept-Language", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

async function go(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params, parsed = parseGoPath(path.map(decodeURIComponent));
  const { locale, matched } = pickLocale(request.headers.get("accept-language"));
  if (!parsed) return NextResponse.redirect(new URL(`/${locale}/`, request.url), { status: 307, headers });
  const catalog = getCatalog(), registry = makeRouteRegistry(getCatalogRoutes(catalog));
  // A finished campaign or a missing page still lands somewhere useful: the language home.
  const target = isExpired(parsed.link) ? undefined : pathFor(registry, `place:${parsed.link.placeId}`, locale);
  if (!isAutomated(request.headers.get("user-agent"), request.method)) await recordGoScan({ code: parsed.code, channel: parsed.channel, language: locale, matched }, { url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY });
  const destination = new URL(target ?? `/${locale}/`, request.url);
  // The poster channel rides along so the claim page can note which poster a coupon came from.
  if (target && parsed.channel) destination.searchParams.set("ch", parsed.channel);
  return NextResponse.redirect(destination, { status: 307, headers });
}
export { go as GET, go as HEAD };
