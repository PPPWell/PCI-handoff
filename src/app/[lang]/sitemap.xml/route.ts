import { isLocale } from "@/lib/i18n";
import { getCatalog } from "@/lib/catalog/load";
import { contentMode, siteOrigin, sitemapXml } from "@/lib/catalog/seo";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) return new Response("Not found", { status: 404 });
  return new Response(sitemapXml(getCatalog(), lang, siteOrigin(), contentMode()), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
