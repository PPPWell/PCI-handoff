import { locales } from "@/lib/i18n";
import { contentMode, escapeXml, siteOrigin } from "@/lib/catalog/seo";
export const dynamic = "force-static";
// Sitemap files are served without a trailing slash (pages keep theirs); a slash here would be a 308 that crawlers
// may refuse to follow inside a sitemap index.
export function GET() {
  const origin = siteOrigin();
  const sitemaps = origin && contentMode() === "published" ? locales.map((locale) => `<sitemap><loc>${escapeXml(`${origin}/${locale}/sitemap.xml`)}</loc></sitemap>`).join("") : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps}</sitemapindex>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
