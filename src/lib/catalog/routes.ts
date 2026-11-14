import type { Catalog, RouteEntry, RouteRegistry } from "./types";
import { getStatePreviewRoutes } from "../states/routes";
import { getCommerceRoutes } from "../commerce/routes";
import { getExperienceRoutes } from "../vouchers/experience-routes";
import { getInfoRoutes } from "../info/routes";
import { locales, type Locale } from "../i18n";
import { cityPlaces, isForLocale } from "./select";
import type { CategoryId } from "../routes";

export const categorySegments: Record<Locale, Record<CategoryId, string>> = {
  zh: { eat: "eat", do: "do", shop: "shop", stay: "stay", guides: "guides" },
  it: { eat: "mangiare", do: "esplorare", shop: "botteghe", stay: "dormire", guides: "guides" },
  en: { eat: "eat", do: "do", shop: "shop", stay: "stay", guides: "guides" },
};
export function getCatalogRoutes(catalog: Catalog): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const add = (entry: RouteEntry) => {
    if (routes.some((previous) => previous.path === entry.path)) throw new Error(`Duplicate page path ${entry.path} (${entry.id})`);
    routes.push(entry);
  };
  for (const locale of locales) {
    add({ id: "home", kind: "home", locale, path: `/${locale}/` });
    for (const city of catalog.cities.filter((city) => city.status !== "draft")) {
      const copy = city.translations[locale]; if (!copy) continue;
      const cityPath = `/${locale}/${copy.slug}/`;
      add({ id: `city:${city.id}`, kind: "city", locale, cityId: city.id, path: cityPath });
      for (const category of ["eat", "do", "shop", "stay"] as const) {
        const allPlaces = cityPlaces(catalog, city.id).filter((place) => place.facts.category === category);
        const places = allPlaces.filter((place) => isForLocale(place.facts.audience, locale));
        const path = `${cityPath}${categorySegments[locale][category]}/`;
        add({ id: `category:${city.id}:${category}`, kind: "category", locale, cityId: city.id, category, path });
        for (const term of catalog.taxonomy.subcategories[category]) {
          if (places.some((place) => place.facts.subcategory === term.id)) add({ id: `subcategory:${city.id}:${category}:${term.id}`, kind: "subcategory", locale, cityId: city.id, category, subcategory: term.id, path: `${path}${term.id}/` });
        }
        for (const place of allPlaces) {
          if (place.translations[locale]) add({ id: `place:${place.id}`, kind: "place", locale, cityId: city.id, category, entityId: place.id, purchaseBar: place.facts.category === "eat" && place.facts.profile === "complete", path: `${path}${place.translations[locale].slug}/` });
        }
      }
      add({ id: `category:${city.id}:guides`, kind: "category", locale, cityId: city.id, category: "guides", path: `${cityPath}guides/` });
    }
    for (const guide of catalog.guides.filter((guide) => guide.status !== "draft")) {
      const city = catalog.cities.find((city) => city.id === guide.cityId && city.status !== "draft");
      if ((guide.cityId !== null && !city) || !guide.translations[locale]) continue;
      const location = city ? city.translations[locale].slug : "italy";
      add({ id: `guide:${guide.id}`, kind: "guide", locale, cityId: city?.id, entityId: guide.id, path: `/${locale}/${location}/guides/${guide.translations[locale].slug}/` });
    }
  }
  for (const route of [...getInfoRoutes(), ...getStatePreviewRoutes(), ...getCommerceRoutes(catalog), ...getExperienceRoutes()]) add(route);
  for (const offer of catalog.offers.filter(offer => offer.benefit)) for (const locale of locales) add({id:`coupon:${offer.benefit!.campaignId}`,kind:"coupon",purchaseBar:true,locale,entityId:offer.id,parent:`place:${offer.placeId}`,path:`/${locale}/claim/${offer.benefit!.campaignId}/`});
  return routes;
}
export function makeRouteRegistry(routes: RouteEntry[]): RouteRegistry {
  const entries = new Map<string, RouteRegistry[number]>();
  for (const route of routes) {
    const entry = entries.get(route.id) ?? { id: route.id, paths: {}, kind: route.kind, category: route.category, cityId: route.cityId, purchaseBar: route.purchaseBar, parent: route.parent };
    entry.paths[route.locale] = route.path; entries.set(route.id, entry);
  }
  return [...entries.values()];
}
export function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0]; return path.endsWith("/") ? path : `${path}/`;
}
export function resolveLanguagePath(pathname: string, target: Locale, registry: RouteRegistry): string {
  const normalized=normalizePath(pathname);
  if(/^\/(zh|it|en)\/merchant\/(?:login|today|scan|manual|pin|devices|statements|voucher\/[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])\/$/.test(normalized))return normalized.replace(/^\/(zh|it|en)\//,`/${target}/`);
  const entry = registry.find((entry) => Object.values(entry.paths).includes(normalizePath(pathname)));
  return entry?.paths[target] ?? registry.find((city) => city.id === `city:${entry?.cityId ?? "florence"}`)?.paths[target] ?? `/${target}/`;
}
export function pathFor(registry: RouteRegistry, id: string, locale: Locale): string | undefined {
  return registry.find((entry) => entry.id === id)?.paths[locale];
}
