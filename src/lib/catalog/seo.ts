import { isLaunched } from "@/lib/routes";
import { getInfoContent } from "../info/load";
import { commerceCopy } from "../commerce/copy";
import { experienceCopy } from "../vouchers/experience-copy";
import { stateCopy } from "../states/copy";
import type { InfoContent } from "../info/types";
import { infoPageIds, isInfoPageId, privateInfoPage } from "../info/routes";
import type { Metadata } from "next";
import type { Catalog, RouteEntry, RouteRegistry } from "./types";
import { htmlLanguages, isLocale, locales, ui } from "../i18n";
import { categoryNames } from "../routes";
import { contentCopy } from "./copy";
import { getCatalogRoutes } from "./routes";
import { cityPlaces } from "./select";
import { getHomeContent } from "../content";
import type { Place } from "./types";

export const contentMode = (): "preview" | "published" => process.env.CONTENT_MODE === "published" ? "published" : "preview";
export function siteOrigin(): string | undefined {
  const value = process.env.SITE_ORIGIN;
  if (!value) { if (contentMode() === "published") throw new Error("SITE_ORIGIN must be configured before published builds"); return undefined; }
  const url = new URL(value);
  if ((url.protocol !== "https:" && !(contentMode() === "preview" && url.hostname === "127.0.0.1")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("SITE_ORIGIN must be an https origin without a path or credentials");
  return url.origin;
}
export function routeText(route: RouteEntry, catalog: Catalog): { title: string; description: string } {
  if (route.kind === "coupon") {const offer=catalog.offers.find(offer=>offer.id===route.entityId)!;return {title:offer.translations[route.locale].name,description:offer.translations[route.locale].summary};}
  const locale = route.locale, city = catalog.cities.find((city) => city.id === route.cityId);
  if(route.kind==="commerce"&&route.commercePage) return {title:commerceCopy[locale].titles[route.commercePage],description:commerceCopy[locale].description};
  if(route.kind==="experience"&&route.experiencePage) return {title:experienceCopy[locale].titles[route.experiencePage],description:experienceCopy[locale][route.experiencePage==="account"||route.experiencePage==="verify"?"closed":"example"]};
  if (route.kind === "info" && isInfoPageId(route.entityId ?? "")) { const page = getInfoContent(locale).pages[route.entityId as keyof ReturnType<typeof getInfoContent>["pages"]];return { title: page.title, description: page.description }; }
  if (route.kind === "preview") return {title:stateCopy[locale].previewTitle,description:stateCopy[locale].previewNote};
  if (route.kind === "home") return { title: locale === "zh" ? "中意公馆" : "Palazzo Italia-Cina", description: contentCopy[locale].subscription };
  if (route.kind === "place") { const place = catalog.places.find((place) => place.id === route.entityId)!; return { title: place.translations[locale].name, description: place.translations[locale].highlight }; }
  if (route.kind === "guide") { const guide = catalog.guides.find((guide) => guide.id === route.entityId)!; return { title: guide.translations[locale].title, description: guide.translations[locale].description }; }
  if (route.kind === "city") return { title: city!.translations[locale].name, description: city!.translations[locale].intro };
  const category = route.category!, subcategory = category === "guides" ? null : catalog.taxonomy.subcategories[category].find((term) => term.id === route.subcategory);
  const label = subcategory?.names[locale] ?? categoryNames[locale][category], cityName = city!.translations[locale].name;
  return { title: `${label} · ${cityName}`, description: listDescription(catalog, route, label, cityName) };
}
/** A list page names the places on it, so search results tell it apart from the city page. */
function listDescription(catalog: Catalog, route: RouteEntry, label: string, cityName: string): string {
  const locale = route.locale, city = catalog.cities.find((city) => city.id === route.cityId)!;
  const names = cityPlaces(catalog, city.id, locale).filter((place) => place.status === "published" && place.facts.category === route.category && (!route.subcategory || place.facts.subcategory === route.subcategory)).map((place) => place.translations[locale].name);
  if (!names.length || route.category === "guides") return city.translations[locale].intro;
  return locale === "zh" ? `${cityName}${label}：${names.join("、")}。中文写清楚吃什么、适合谁、怎么订位。`
    : locale === "it" ? `${label} a ${cityName}: ${names.join(", ")}. Cosa ordinare, per chi è adatto e come prenotare, in cinese, italiano e inglese.`
    : `${label} in ${cityName}: ${names.join(", ")}. What to order, who it suits and how to book, in Chinese, Italian and English.`;
}
const placeKind = { eat: { zh: "餐厅", it: "ristorante", en: "restaurant" }, do: { zh: "景点", it: "luogo", en: "place to visit" }, shop: { zh: "商店", it: "bottega", en: "shop" }, stay: { zh: "住宿", it: "alloggio", en: "stay" } } as const;
/** "PaStation Firenze｜佛罗伦萨餐厅": the town comes from the address (Macolo is in Pistoia, not Florence), named in the page's language through the city or area that carries it. */
function placeTitle(place: Place, catalog: Catalog, locale: RouteEntry["locale"]): string {
  const town = place.facts.address.match(/\b\d{5} ([^,]+?)(?: [A-Z]{2})?(?:,|$)/)?.[1]?.trim(), city = catalog.cities.find((city) => city.id === place.facts.cityId);
  const local = city && (city.translations.it.name === town ? city.translations[locale].name : city.areas.find((area) => area.translations.it.name === town)?.translations[locale].name);
  const where = local ?? town ?? city?.translations[locale].name ?? "", kind = placeKind[place.facts.category][locale], name = place.translations[locale].name;
  return locale === "zh" ? `${name}｜${where}${kind}` : locale === "it" ? `${name}, ${kind} a ${where}` : `${name}, ${kind} in ${where}`;
}
export function pageMetadata(route: RouteEntry, catalog: Catalog, registry: RouteRegistry, origin?: string): Metadata {
  const copy = routeText(route, catalog), entry = registry.find((entry) => entry.id === route.id), paths = entry?.paths ?? {};
  const languages = Object.fromEntries(locales.filter((locale) => paths[locale]).map((locale) => [htmlLanguages[locale], paths[locale]!]));
  if (paths.en) languages["x-default"] = paths.en;
  const infoIndex = route.kind !== "info" || (isInfoPageId(route.entityId ?? "") && !privateInfoPage(route.entityId!) && getInfoContent(route.locale).pages[route.entityId as keyof ReturnType<typeof getInfoContent>["pages"]].status === "published");
  const index = contentMode() === "published" && infoIndex && route.kind !== "preview" && route.kind !== "coupon" && route.kind !== "commerce" && route.kind !== "experience" && (route.kind !== "category" || isLaunched(route.category!));
  // Search titles: the home page has its own; a place adds what and where; everything else is "page | brand".
  const home = route.kind === "home" ? getHomeContent(route.locale).seo : null, place = route.kind === "place" ? catalog.places.find((place) => place.id === route.entityId) : undefined;
  const title = home ? { absolute: home.title } : `${place ? placeTitle(place, catalog, route.locale) : copy.title} | Palazzo Italia-Cina`, description = home?.description ?? copy.description;
  // Link previews (WhatsApp, Telegram, search results): the place or guide's first photo, else the brand card.
  const photo = route.kind === "place" ? catalog.places.find((place) => place.id === route.entityId)?.facts.photos[0] : route.kind === "guide" ? catalog.guides.find((guide) => guide.id === route.entityId)?.photos[0] : undefined;
  const openGraph = { type: route.kind === "guide" ? "article" as const : "website" as const, siteName: "Palazzo Italia-Cina", title: home?.title ?? copy.title, description, locale: htmlLanguages[route.locale].replace("-", "_"), ...(origin ? { url: route.path } : {}), images: photo ? [{ url: photo.url, alt: photo.alt[route.locale] }] : [{ url: "/og-default.png", width: 1200, height: 630, alt: "Palazzo Italia-Cina" }] };
  return { title, description, ...(origin ? { metadataBase: new URL(origin) } : {}), alternates: { ...(origin ? { canonical: route.path } : {}), languages }, robots: { index, follow: index }, openGraph };
}
export function structuredData(route: RouteEntry, catalog: Catalog, origin?: string, mode: "preview" | "published" = "preview"): unknown {
  if (!origin || mode !== "published" || route.kind === "preview" || route.kind === "coupon" || route.kind === "commerce" || route.kind === "experience") return null;
  if (route.kind === "info" && (privateInfoPage(route.entityId!) || !isInfoPageId(route.entityId!) || getInfoContent(route.locale).pages[route.entityId!].status !== "published")) return null;
  const url = new URL(route.path, origin).href, locale = route.locale;
  const organization = { "@type": "Organization", "@id": new URL("/#organization", origin).href, name: "Palazzo Italia-Cina", alternateName: "中意公馆", url: new URL(`/${locale}/`, origin).href, logo: new URL("/apple-touch-icon.png", origin).href, email: "info@palazzoitaliacina.com" };
  const breadcrumbs = [{ name: ui[locale].home, item: new URL(`/${locale}/`, origin).href }], city = catalog.cities.find((city) => city.id === route.cityId);
  if (city) breadcrumbs.push({ name: city.translations[locale].name, item: new URL(`/${locale}/${city.translations[locale].slug}/`, origin).href });
  const categoryRoute = route.category ? getCatalogRoutes(catalog).find((entry) => entry.locale === locale && entry.id === `category:${route.cityId}:${route.category}`) : undefined;
  if (categoryRoute) breadcrumbs.push({ name: categoryNames[locale][route.category!], item: new URL(categoryRoute.path, origin).href });
  if (breadcrumbs.at(-1)?.item !== url) breadcrumbs.push({ name: routeText(route, catalog).title, item: url });
  const graph = (page?: Record<string, unknown>) => ({ "@context": "https://schema.org", "@graph": [organization, { "@type": "BreadcrumbList", itemListElement: breadcrumbs.map((item, index) => ({ "@type": "ListItem", position: index + 1, ...item })) }, ...(page ? [page] : [])] });
  if (route.kind === "home") return graph({ "@type": "WebSite", url, name: locale === "zh" ? "中意公馆" : "Palazzo Italia-Cina", alternateName: locale === "zh" ? "Palazzo Italia-Cina" : "中意公馆", inLanguage: htmlLanguages[locale], publisher: { "@id": organization["@id"] } });
  const base = { url, inLanguage: htmlLanguages[locale] };
  if (route.kind === "place") {
    const place = catalog.places.find((place) => place.id === route.entityId)!;
    if (place.status !== "published") return null;
    const copy = place.translations[locale], type = { eat: "Restaurant", do: "TouristAttraction", shop: "Store", stay: "LodgingBusiness" }[place.facts.category];
    const offers = catalog.offers.filter((offer) => offer.placeId === place.id && offer.priceCents !== null).map((offer) => ({ "@type": "Offer", name: offer.translations[locale].name, price: (offer.priceCents! / 100).toFixed(2), priceCurrency: offer.currency, availability: offer.status === "on-sale" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url }));
    return graph({ ...base, "@type": type, name: copy.name, alternateName: place.facts.originalName, description: copy.highlight, ...(place.facts.reservations.phone ? { telephone: place.facts.reservations.phone } : {}), ...(place.facts.reservations.website ? { sameAs: [place.facts.reservations.website] } : {}), address: { "@type": "PostalAddress", streetAddress: place.facts.address, addressCountry: "IT" }, ...(place.facts.coordinates ? { geo: { "@type": "GeoCoordinates", latitude: place.facts.coordinates.lat, longitude: place.facts.coordinates.lng } } : {}), image: place.facts.photos.map((photo) => photo.url), ...(offers.length ? { makesOffer: offers } : {}) });
  }
  if (route.kind === "guide") {
    const guide = catalog.guides.find((guide) => guide.id === route.entityId)!;
    if (guide.status !== "published") return null;
    return graph({ ...base, "@type": "Article", headline: guide.translations[locale].title, description: guide.translations[locale].description, dateModified: guide.verifiedAt, author: { "@type": "Organization", name: contentCopy[locale].editor }, publisher: organization, image: guide.photos.map((photo) => photo.url) });
  }
  return graph();
}
export function serializeJsonLd(value: unknown): string { return JSON.stringify(value).replace(/</g, "\\u003c"); }
export function escapeXml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
export function sitemapXml(catalog: Catalog, locale: string, origin?: string, mode: "preview" | "published" = "preview", information?: InfoContent): string {
  const info = information ?? (isLocale(locale) ? getInfoContent(locale) : undefined);
  const published = { ...catalog, cities: catalog.cities.filter((city) => city.status === "published"), places: catalog.places.filter((place) => place.status === "published"), guides: catalog.guides.filter((guide) => guide.status === "published" && guide.placeIds.every((id) => catalog.places.some((place) => place.id === id && place.status === "published"))) };
  const hasInformation = info && infoPageIds.some((id) => !privateInfoPage(id) && info.pages[id].status === "published");
  const routes = mode === "published" && origin && (published.cities.length || published.guides.length || hasInformation) ? getCatalogRoutes(published).filter((route) => route.locale === locale && route.kind !== "preview" && route.kind !== "coupon" && route.kind !== "commerce" && route.kind !== "experience" && (route.kind !== "category" || isLaunched(route.category!)) && (route.kind !== "info" || (isInfoPageId(route.entityId!) && !privateInfoPage(route.entityId!) && info?.pages[route.entityId!].status === "published"))) : [];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((route) => `<url><loc>${escapeXml(new URL(route.path, origin).href)}</loc></url>`).join("")}</urlset>`;
}
export function requestPrivacyHeaders(url: URL): Record<string, string> {
  if (/^\/(?:zh|it|en)\/(?:account|merchant|claim)(?:\/|$)/.test(url.pathname)) return { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" };
  if (/^\/(?:v|c|go)(?:\/|$)/.test(url.pathname)) return { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" };
  if (/^\/(?:zh|it|en)\/preview(?:\/|$)/.test(url.pathname)) return { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store" };
  if (/\/(?:checkout|success|email-help|account|merchant)(?:\/|$)/.test(url.pathname)) return { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store" };
  if (/^\/(?:zh|it|en)\/subscribe\/(?:confirm|unsubscribe)\/?$/.test(url.pathname)) return { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" };
  if (/^\/(?:zh|it|en)\/subscribe\/?$/.test(url.pathname)) return { "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" };
  if (["subcategory", "area", "price", "tag", "offer"].some((name) => url.searchParams.has(name))) return { "X-Robots-Tag": "noindex, follow" };
  return {};
}
