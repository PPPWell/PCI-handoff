import { menuItems } from "./menu";
import {existsSync} from "node:fs";
import {join} from "node:path";
import type { Catalog } from "./types";
import { imageOrigin } from "./image-origin";
import { locales } from "../i18n";

type RecordValue = Record<string, unknown>;
function fail(path: string, message = "required or invalid field"): never { throw new Error(`${path}: ${message}`); }
function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path);
  return value as RecordValue;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) fail(path);
  return value as string;
}
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) fail(path); return value as unknown[]; }
function requiredArray(value: unknown, path: string) { const items = array(value, path); if (!items.length) fail(path, "must contain at least one item"); return items; }
function strings(value: unknown, path: string) { for (const [index, item] of requiredArray(value, path).entries()) text(item, `${path}[${index}]`); }
function choice(value: unknown, allowed: readonly unknown[], path: string) { if (!allowed.includes(value)) fail(path, `expected ${allowed.join(" / ")}`); }
function fields(value: RecordValue, required: string[], path: string) { for (const field of required) text(value[field], `${path}.${field}`); }
function translations(value: unknown, path: string, validate: (copy: RecordValue, path: string) => void) {
  const copies = object(value, path);
  for (const locale of locales) validate(object(copies[locale], `${path}.${locale}`), `${path}.${locale}`);
}
function slug(value: unknown, path: string) { if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text(value, path))) fail(path, "invalid URL segment"); }
function date(value: unknown, path: string) {
  const string = text(value, path);
  const parsed = new Date(`${string}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(string) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== string) fail(path, "expected a real ISO date");
}
function safeUrl(value: unknown, path: string) {
  try { const url = new URL(text(value, path)); if (url.protocol !== "https:" || url.username || url.password) fail(path, "expected an https URL without credentials"); }
  catch { fail(path, "expected an https URL without credentials"); }
}
function photos(value: unknown, path: string, published: boolean, origin: string | undefined) {
  for (const [index, item] of array(value, path).entries()) {
    const p = `${path}[${index}]`, photo = object(item, p);
    const local = typeof photo.url === "string" && /^\/images\/(?:places|cities)\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(photo.url);
    if (!local) safeUrl(photo.url, `${p}.url`);
    else if (!existsSync(join(process.cwd(),"public",String(photo.url).slice(1)))) fail(`${p}.url`,"local photo is missing");
    fields(photo, ["creator", "takenAt", "permission", "attribution"], p);
    choice(photo.source, ["self", "merchant", "open", "provided"], `${p}.source`);
    const alt = object(photo.alt, `${p}.alt`);
    for (const locale of locales) text(alt[locale], `${p}.alt.${locale}`);
    // Photos supplied by the restaurant or the project often come without a shooting date; "unknown" says so honestly, the permission line records when they were given.
    if (published && !(photo.takenAt === "unknown" && (photo.source === "provided" || photo.source === "merchant"))) date(photo.takenAt, `${p}.takenAt`);
    if (!local && !origin) fail(`${p}.url`, "photos require R2_PUBLIC_ORIGIN");
    if (!local && new URL(String(photo.url)).origin !== origin) fail(`${p}.url`, "photo must use the configured image origin");
  }
}
function publishable(value: unknown, path: string) {
  if (typeof value === "string" && /\[[^\]]*\]/.test(value)) fail(path, "placeholder content cannot be published");
  if (Array.isArray(value)) value.forEach((item, index) => publishable(item, `${path}[${index}]`));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) publishable(item, `${path}.${key}`);
}
function ids(items: unknown[], collection: string): Set<string> {
  const found = new Set<string>();
  for (const item of items) {
    const id = text(object(item, collection).id, `${collection}.id`); slug(id, `${collection}/${id}.id`);
    if (found.has(id)) fail(`${collection}/${id}`, "duplicate id"); found.add(id);
  }
  return found;
}

export function validateCatalog(value: unknown, mode: "preview" | "published" = "preview", publicImageOrigin = process.env.R2_PUBLIC_ORIGIN): asserts value is Catalog {
  const origin = imageOrigin(publicImageOrigin);
  const catalog = object(value, "catalog");
  const cities = array(catalog.cities, "cities"), places = array(catalog.places, "places"), guides = array(catalog.guides, "guides"), offers = array(catalog.offers, "offers");
  const cityIds = ids(cities, "cities"), placeIds = ids(places, "places"); ids(guides, "guides"); ids(offers, "offers");
  const taxonomy = object(catalog.taxonomy, "taxonomy"), subcategories = object(taxonomy.subcategories, "taxonomy.subcategories");
  const categoryIds = ["eat", "do", "shop", "stay"];
  const taxonIds = (value: unknown, path: string) => {
    const items = array(value, path); const found = ids(items, path);
    for (const item of items) { const term = object(item, path), names = object(term.names, `${path}.names`); for (const locale of locales) text(names[locale], `${path}.names.${locale}`); }
    return found;
  };
  const typeTags = taxonIds(taxonomy.typeTags, "taxonomy.typeTags"), sceneTags = taxonIds(taxonomy.sceneTags, "taxonomy.sceneTags");
  const subcategoryIds = Object.fromEntries(categoryIds.map((id) => [id, taxonIds(subcategories[id], `taxonomy.subcategories.${id}`)]));
  const usedPaths = new Set<string>();
  const uniquePath = (path: string, source: string) => { if (usedPaths.has(path)) fail(source, `duplicate localized path: ${path}`); usedPaths.add(path); };
  const citySlugs: Record<string, Record<string, string>> = {};
  const areas: Record<string, Set<string>> = {};
  const activeReference = (entry: RecordValue, referenced: RecordValue | undefined, path: string) => {
    if (entry.status === "draft") return;
    if (!referenced || referenced.status === "draft") fail(path, "reference points to draft content without a route");
    if (entry.status === "published" && referenced.status !== "published") fail(path, "published content must reference published content");
  };
  const status = (entry: RecordValue, path: string) => {
    choice(entry.status, ["draft", "preview", "published"], `${path}.status`);
    if (mode === "published" && entry.status === "preview") fail(path, "preview content cannot be published");
    return entry.status === "published" || (mode === "published" && entry.status !== "draft");
  };
  for (const item of cities) {
    const city = object(item, "cities"), id = String(city.id), path = `cities/${id}`, published = status(city, path);
    citySlugs[id] = {}; areas[id] = new Set(); photos(city.photos, `${path}.photos`, published, origin);
    translations(city.translations, `${path}.translations`, (copy, p) => {
      fields(copy, ["slug", "name", "intro"], p); slug(copy.slug, `${p}.slug`);
      const locale = p.split(".").at(-1)!; citySlugs[id][locale] = String(copy.slug); uniquePath(`/${locale}/${copy.slug}/`, p);
      for (const [index, section] of array(copy.practical, `${p}.practical`).entries()) fields(object(section, `${p}.practical[${index}]`), ["heading", "text"], `${p}.practical[${index}]`);
    });
    for (const area of array(city.areas, `${path}.areas`)) {
      const entry = object(area, `${path}.areas`); slug(entry.id, `${path}.areas.id`); if (areas[id].has(String(entry.id))) fail(`${path}.areas`, "duplicate area id"); areas[id].add(String(entry.id));
      translations(entry.translations, `${path}.areas.${entry.id}.translations`, (copy, p) => { fields(copy, ["slug", "name", "intro"], p); slug(copy.slug, `${p}.slug`); });
    }
    if (published) publishable(city, path);
  }
  for (const item of places) {
    const place = object(item, "places"), path = `places/${place.id}`, published = status(place, path), facts = object(place.facts, `${path}.facts`);
    fields(facts, ["originalName", "cityId", "category", "subcategory", "areaId", "address", "openingHours", "priceBand", "verifiedAt"], `${path}.facts`);
    if (!cityIds.has(String(facts.cityId))) fail(`${path}.facts.cityId`, "unknown city");
    activeReference(place, cities.map((item) => object(item, "cities")).find((city) => city.id === facts.cityId), `${path}.facts.cityId`);
    choice(facts.category, categoryIds, `${path}.facts.category`);
    if (!subcategoryIds[String(facts.category)].has(String(facts.subcategory))) fail(`${path}.facts.subcategory`, "unknown subcategory");
    if (!areas[String(facts.cityId)].has(String(facts.areaId))) fail(`${path}.facts.areaId`, "unknown area");
    for (const [key, allowed] of [["typeTags", typeTags], ["sceneTags", sceneTags]] as const) {
      for (const tag of array(facts[key], `${path}.facts.${key}`)) if (!allowed.has(String(tag))) fail(`${path}.facts.${key}`, `unknown tag ${tag}`);
    }
    choice(facts.verification, ["visited", "checked"], `${path}.facts.verification`);
    choice(facts.partnership, ["exclusive", "partner", "independent"], `${path}.facts.partnership`);
    choice(facts.profile, ["complete", "brief"], `${path}.facts.profile`);
    for (const audience of array(facts.audience, `${path}.facts.audience`)) choice(audience, ["tourist", "local"], `${path}.facts.audience`);
    photos(facts.photos, `${path}.facts.photos`, published, origin);
    if (facts.coordinates !== null) {
      const coordinates = object(facts.coordinates, `${path}.facts.coordinates`);
      if (typeof coordinates.lat !== "number" || !Number.isFinite(coordinates.lat) || Math.abs(coordinates.lat) > 90 || typeof coordinates.lng !== "number" || !Number.isFinite(coordinates.lng) || Math.abs(coordinates.lng) > 180) fail(`${path}.facts.coordinates`, "invalid latitude/longitude");
    } else if (published) fail(`${path}.facts.coordinates`, "published places need verified coordinates");
    if (facts.nearby !== undefined) {
      if (!Array.isArray(facts.nearby)) fail(`${path}.facts.nearby`, "must be a list");
      (facts.nearby as unknown[]).forEach((entry, index) => {
        const item = object(entry, `${path}.facts.nearby[${index}]`);
        if (typeof item.minutes !== "number" || !Number.isInteger(item.minutes) || item.minutes < 1 || item.minutes > 60) fail(`${path}.facts.nearby[${index}].minutes`, "whole minutes 1-60");
        const landmark = object(item.landmark, `${path}.facts.nearby[${index}].landmark`);
        for (const l of ["zh", "it", "en"]) text(landmark[l], `${path}.facts.nearby[${index}].landmark.${l}`);
      });
    }
    const reservations = object(facts.reservations, `${path}.facts.reservations`); fields(reservations, ["walkIn", "advanceDays", "suggestedArrival"], `${path}.facts.reservations`);
    for (const field of ["whatsapp", "phone", "email", "website", "instagram", "googleMaps", "recommended"]) {
      if (reservations[field] !== null) text(reservations[field], `${path}.facts.reservations.${field}`);
    }
    if (reservations.booking !== undefined && reservations.booking !== null) { text(reservations.booking, `${path}.facts.reservations.booking`); safeUrl(reservations.booking, `${path}.facts.reservations.booking`); }
    for (const field of ["website", "instagram", "googleMaps"]) if (reservations[field] !== null) safeUrl(reservations[field], `${path}.facts.reservations.${field}`);
    if (reservations.recommended !== null && !["whatsapp", "phone", "email", "website", "instagram", "googleMaps", "booking"].includes(String(reservations.recommended))) fail(`${path}.facts.reservations.recommended`);
    if (reservations.recommended && !reservations[String(reservations.recommended)]) fail(`${path}.facts.reservations.recommended`, "recommended channel is absent");
    translations(place.translations, `${path}.translations`, (copy, p) => {
      fields(copy, ["slug", "name", "highlight", "story", "practicalTips", "suitableFor"], p); slug(copy.slug, `${p}.slug`); strings(copy.reasons, `${p}.reasons`);
      const locale = p.split(".").at(-1)!; uniquePath(`/${locale}/${citySlugs[String(facts.cityId)][locale]}/${facts.category}/${copy.slug}/`, p);
    });
    if (published) { date(facts.verifiedAt, `${path}.facts.verifiedAt`); publishable(place, path); }
  }
  for (const item of guides) {
    const guide = object(item, "guides"), path = `guides/${guide.id}`, published = status(guide, path);
    choice(guide.type, ["pitfalls", "list", "how-to", "comparison", "seasonal"], `${path}.type`); text(guide.verifiedAt, `${path}.verifiedAt`);
    if (guide.cityId !== null && !cityIds.has(String(guide.cityId))) fail(`${path}.cityId`, "unknown city");
    if (guide.cityId !== null) activeReference(guide, cities.map((item) => object(item, "cities")).find((city) => city.id === guide.cityId), `${path}.cityId`);
    for (const id of array(guide.placeIds, `${path}.placeIds`)) {
      if (!placeIds.has(String(id))) fail(`${path}.placeIds`, `unknown linked place ${id}`);
      activeReference(guide, places.map((item) => object(item, "places")).find((place) => place.id === id), `${path}.placeIds.${id}`);
    }
    for (const audience of array(guide.audience, `${path}.audience`)) choice(audience, ["tourist", "local"], `${path}.audience`);
    photos(guide.photos, `${path}.photos`, published, origin);
    translations(guide.translations, `${path}.translations`, (copy, p) => {
      fields(copy, ["slug", "title", "description", "introduction"], p); slug(copy.slug, `${p}.slug`);
      for (const [index, item] of requiredArray(copy.sections, `${p}.sections`).entries()) { const section = object(item, `${p}.sections[${index}]`); text(section.heading, `${p}.sections[${index}].heading`); strings(section.paragraphs, `${p}.sections[${index}].paragraphs`); }
      const locale = p.split(".").at(-1)!, city = guide.cityId === null ? "italy" : citySlugs[String(guide.cityId)][locale]; uniquePath(`/${locale}/${city}/guides/${copy.slug}/`, p);
    });
    if (published) { date(guide.verifiedAt, `${path}.verifiedAt`); publishable(guide, path); }
  }
  for (const item of offers) {
    const offer = object(item, "offers"), path = `offers/${offer.id}`;
    if (!placeIds.has(String(offer.placeId))) fail(`${path}.placeId`, "unknown restaurant");
    const place = places.map((item) => object(item, "places")).find((place) => place.id === offer.placeId)!;
    if (object(place.facts, "place.facts").profile !== "complete") fail(`${path}.placeId`, "offers require a complete restaurant profile");
    if (object(place.facts, "place.facts").category !== "eat") fail(`${path}.placeId`, "offers must belong to restaurants");
    choice(offer.status, ["coming-soon", "paused", "on-sale"], `${path}.status`); choice(offer.currency, ["EUR"], `${path}.currency`); choice(offer.salesMode, ["prepaid", "pay-at-restaurant"], `${path}.salesMode`);
    if (!Number.isSafeInteger(offer.version) || Number(offer.version) < 1) fail(`${path}.version`);
    // Exactly one validity: months (1-24) or days (1-366), as the database accepts.
    if ((offer.validityMonths === undefined) === (offer.validityDays === undefined)) fail(`${path}.validity`, "set validityMonths or validityDays, not both");
    if (offer.validityMonths !== undefined && (!Number.isSafeInteger(offer.validityMonths) || Number(offer.validityMonths) < 1 || Number(offer.validityMonths) > 24)) fail(`${path}.validityMonths`);
    if (offer.validityDays !== undefined && (!Number.isSafeInteger(offer.validityDays) || Number(offer.validityDays) < 1 || Number(offer.validityDays) > 366)) fail(`${path}.validityDays`);
    for (const field of ["priceCents", "aLaCarteCents", "people"]) if (offer[field] !== null && (!Number.isSafeInteger(offer[field]) || Number(offer[field]) < 1)) fail(`${path}.${field}`);
    if (offer.benefit !== undefined) {
      const benefit = object(offer.benefit,`${path}.benefit`);choice(benefit.type,["fixed-amount"],`${path}.benefit.type`);choice(benefit.scope,["partner-menu"],`${path}.benefit.scope`);slug(benefit.campaignId,`${path}.benefit.campaignId`);
      if(!Number.isSafeInteger(benefit.discountCents)||Number(benefit.discountCents)<1||Number(benefit.discountCents)>99999||offer.salesMode!=="pay-at-restaurant"||offer.priceCents!==null||offer.aLaCarteCents!==null||offer.people!==null)fail(`${path}.benefit`,"discount coupons cannot imply a fixed or prepaid meal");
      if(benefit.reference!==undefined){const reference=object(benefit.reference,`${path}.benefit.reference`);if(!Number.isSafeInteger(reference.menuPriceCents)||Number(reference.menuPriceCents)<100||Number(reference.menuPriceCents)>100000)fail(`${path}.benefit.reference.menuPriceCents`,"reference menu price must be whole euro cents");}
    }
    if (offer.menuSection !== undefined) text(offer.menuSection, `${path}.menuSection`);
    if (offer.mealWindows !== undefined) {
      const time = /^([01]\d|2[0-3]):[0-5]\d$/, meals = new Set<string>();
      array(offer.mealWindows, `${path}.mealWindows`).forEach((raw, index) => {
        const window = object(raw, `${path}.mealWindows.${index}`);
        choice(window.meal, ["lunch", "dinner"], `${path}.mealWindows.${index}.meal`);
        if (meals.has(String(window.meal))) fail(`${path}.mealWindows.${index}.meal`, "duplicate meal");
        meals.add(String(window.meal));
        if (typeof window.from !== "string" || typeof window.to !== "string" || !time.test(window.from) || !time.test(window.to) || window.from >= window.to) fail(`${path}.mealWindows.${index}`, "expected from < to as HH:MM");
      });
    }
    if (offer.photos !== undefined) photos(offer.photos, `${path}.photos`, place.status === "published" && mode === "published", origin);
    if (offer.dishes !== undefined) {
      const dishes = array(offer.dishes, `${path}.dishes`); const seen = new Set<string>();
      dishes.forEach((raw, index) => {
        const dish = object(raw, `${path}.dishes.${index}`), dp = `${path}.dishes.${index}`; slug(dish.id, `${dp}.id`);
        if (seen.has(String(dish.id))) fail(`${dp}.id`, "duplicate dish id"); seen.add(String(dish.id));
        if (dish.vegetarian !== null && typeof dish.vegetarian !== "boolean") fail(`${dp}.vegetarian`);
        if (dish.allergens !== null && (!Array.isArray(dish.allergens) || dish.allergens.some((a) => typeof a !== "string" || !/^[a-z-]{2,30}$/.test(a)))) fail(`${dp}.allergens`);
        translations(dish.translations, `${dp}.translations`, (copy, p) => { fields(copy, ["name", "taste"], p); });
      });
    }
    if (!offer.benefit && offer.status === "on-sale" && (offer.priceCents === null || offer.people === null)) fail(path, "on-sale offers require real price and party size");
    let courseCount: number | undefined;
    let dishCount: number | undefined;
    translations(offer.translations, `${path}.translations`, (copy, p) => {
      fields(copy, ["name", "summary", "conditions", "allergens"], p);
      if (!p.endsWith(".zh") && /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(JSON.stringify(copy))) fail(p, "non-Chinese copy contains Chinese characters or punctuation");
      const courses = array(copy.courses, `${p}.courses`); if (!courses.length) fail(`${p}.courses`);
      if (courseCount !== undefined && courses.length !== courseCount) fail(`${path}.courses`, "course translation counts must match");
      courseCount = courses.length;
      for (const [index, item] of courses.entries()) fields(object(item, `${p}.courses[${index}]`), ["name", "description"], `${p}.courses[${index}]`);
      if (offer.benefit) {
        const count = menuItems(String(object(courses[0], `${p}.courses[0]`).description)).length;
        dishCount ??= count;
        if (count !== dishCount) fail(`${path}.courses`, "dish lists must have the same number of dishes in every language");
      }
    });
    if (place.status === "published" && mode === "published") publishable(offer, path);
  }
  for (const item of places) {
    const place = object(item, "places"), facts = object(place.facts, "place.facts");
    const linked = offers.map((item) => object(item, "offers")).filter((offer) => offer.placeId === place.id);
    // Several free coupons may share one restaurant (one per menu); only one prepaid offer is supported.
    if (linked.filter((offer) => !offer.benefit).length > 1) fail(`places/${place.id}.offer`, "only one current prepaid offer is supported");
    if (place.status !== "draft" && (facts.partnership === "exclusive" || facts.profile === "complete") && !linked.length) fail(`places/${place.id}.offer`, "exclusive or complete profiles require an offer");
  }

}
