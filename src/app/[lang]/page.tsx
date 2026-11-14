import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getHomeContent } from "@/lib/content";
import { Home } from "@/components/home/Home";
import { getCatalog } from "@/lib/catalog/load";
import { getCatalogRoutes, makeRouteRegistry } from "@/lib/catalog/routes";
import { contentMode, pageMetadata, serializeJsonLd, siteOrigin, structuredData } from "@/lib/catalog/seo";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params; if (!isLocale(lang)) notFound();
  const catalog = getCatalog(), routes = getCatalogRoutes(catalog), route = routes.find((route) => route.kind === "home" && route.locale === lang)!;
  return pageMetadata(route, catalog, makeRouteRegistry(routes), siteOrigin());
}

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const catalog = getCatalog(), routes = getCatalogRoutes(catalog), registry = makeRouteRegistry(routes), route = routes.find((route) => route.kind === "home" && route.locale === lang)!;
  const data = structuredData(route, catalog, siteOrigin(), contentMode());
  return <>{data !== null && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />}<Home content={getHomeContent(lang)} catalog={catalog} registry={registry} /></>;
}
