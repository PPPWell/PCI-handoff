import { StateGallery } from "@/components/states/StateGallery";
import { CommercePage } from "@/components/commerce/CommercePage";
import { ExperiencePage } from "@/components/vouchers/ExperiencePage";
import { InfoPage } from "@/components/info/InfoPage";
import { isInfoPageId } from "@/lib/info/routes";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getCatalog } from "@/lib/catalog/load";
import { getCatalogRoutes, makeRouteRegistry } from "@/lib/catalog/routes";
import { contentMode, pageMetadata, serializeJsonLd, siteOrigin, structuredData } from "@/lib/catalog/seo";
import { CityPage } from "@/components/content/CityPage";
import { CategoryPage } from "@/components/content/CategoryPage";
import { PlacePage } from "@/components/content/PlacePage";
import { GuidePage } from "@/components/content/GuidePage";

type Params = { lang: string; segments: string[] };
function resolve(params: Params) {
  if (!isLocale(params.lang)) notFound();
  const catalog = getCatalog(), routes = getCatalogRoutes(catalog), path = `/${params.lang}/${params.segments.join("/")}/`, route = routes.find((route) => route.path === path);
  if (!route) notFound();
  return { catalog, routes, route, registry: makeRouteRegistry(routes) };
}
export const dynamicParams = false;
export function generateStaticParams({ params }: { params: { lang: string } }) {
  return getCatalogRoutes(getCatalog()).filter((route) => route.locale === params.lang && route.kind !== "home" && route.kind !== "coupon" && route.experiencePage !== "account" && route.experiencePage !== "verify").map((route) => ({ segments: route.path.split("/").filter(Boolean).slice(1) }));
}
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { catalog, route, registry } = resolve(await params); return pageMetadata(route, catalog, registry, siteOrigin());
}
export default async function ContentPage({ params }: { params: Promise<Params> }) {
  const { catalog, route, registry } = resolve(await params), locale = route.locale;
  const data = structuredData(route, catalog, siteOrigin(), contentMode());
  return <>{data !== null && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />}
    {route.kind === "experience" ? <ExperiencePage route={route} catalog={catalog} registry={registry} /> : route.kind === "commerce" ? <CommercePage route={route} catalog={catalog} registry={registry} /> : route.kind === "preview" ? <StateGallery locale={locale} /> : route.kind === "city" ? <CityPage city={catalog.cities.find((city) => city.id === route.cityId)!} catalog={catalog} locale={locale} registry={registry} />
      : route.kind === "category" || route.kind === "subcategory" ? <CategoryPage route={route} catalog={catalog} registry={registry} />
      : route.kind === "place" ? <PlacePage place={catalog.places.find((place) => place.id === route.entityId)!} catalog={catalog} locale={locale} registry={registry} />
      : route.kind === "info" && isInfoPageId(route.entityId!) ? <InfoPage id={route.entityId!} locale={locale} registry={registry} />
      : route.kind === "guide" ? <GuidePage guide={catalog.guides.find((guide) => guide.id === route.entityId)!} catalog={catalog} locale={locale} registry={registry} /> : null}
  </>;
}
