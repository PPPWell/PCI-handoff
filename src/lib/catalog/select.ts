import type { Catalog, Guide, Place } from "./types";
import type { Locale } from "../i18n";

export function isForLocale(audience: ("tourist" | "local")[], locale: Locale) { return audience.includes(locale === "it" ? "local" : "tourist"); }
export function cityPlaces(catalog: Catalog, cityId: string, locale?: Locale) {
  if (!catalog.cities.some((city) => city.id === cityId && city.status !== "draft")) return [];
  return catalog.places.filter((place) => place.status !== "draft" && place.facts.cityId === cityId && (!locale || isForLocale(place.facts.audience, locale)));
}
export function availableGuides(catalog: Catalog, locale?: Locale): Guide[] { return catalog.guides.filter((guide) => guide.status !== "draft" && (guide.cityId === null || catalog.cities.some((city) => city.id === guide.cityId && city.status !== "draft")) && (!locale || isForLocale(guide.audience, locale))); }
export function relatedPlaces(catalog: Catalog, current: Place, locale?: Locale) { return cityPlaces(catalog, current.facts.cityId, locale).filter((place) => place.id !== current.id && place.facts.areaId === current.facts.areaId).slice(0, 3); }
export function containingGuides(catalog: Catalog, placeId: string, locale?: Locale) { return availableGuides(catalog, locale).filter((guide) => guide.placeIds.includes(placeId)); }
export function featuredGuides(catalog: Catalog, locale: Locale) {
  const ids = locale === "it" ? ["trattorie", "regional", "walk-in"] : ["tipping", "steak", "hours"];
  const guides = availableGuides(catalog, locale);
  return ids.map((id) => guides.find((guide) => guide.id === id)).filter((guide): guide is Guide => !!guide);
}
export function money(cents: number | null, locale: Locale): string {
  if (cents === null) return locale === "zh" ? "€[价格]" : locale === "it" ? "€[prezzo]" : "€[price]";
  const amount = (cents / 100).toLocaleString(locale === "zh" ? "zh-CN" : locale, { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  // Italian writes the euro sign after the number.
  return locale === "it" ? `${amount}\u00a0€` : `€${amount}`;
}
