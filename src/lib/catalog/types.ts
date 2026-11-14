import type { Locale } from "../i18n";

export type Localized<T> = Record<Locale, T>;
export type MainCategory = "eat" | "do" | "shop" | "stay";
export type ContentStatus = "draft" | "preview" | "published";
export interface Photo {
  url: string;
  alt: Localized<string>;
  creator: string;
  takenAt: string;
  source: "self" | "merchant" | "open" | "provided";
  permission: string;
  attribution: string;
}
export interface PlaceCopy {
  slug: string; name: string; highlight: string; reasons: string[]; story: string; practicalTips: string; suitableFor: string;
}
export interface Place {
  id: string; status: ContentStatus;
  facts: {
    originalName: string; cityId: string; category: MainCategory; subcategory: string; areaId: string;
    typeTags: string[]; sceneTags: string[]; address: string; coordinates: { lat: number; lng: number } | null;
    openingHours: string; priceBand: string; verifiedAt: string; verification: "visited" | "checked";
    partnership: "exclusive" | "partner" | "independent"; profile: "complete" | "brief";
    audience: ("tourist" | "local")[]; photos: Photo[];
    nearby?: { landmark: Localized<string>; minutes: number }[];
    reservations: { whatsapp: string | null; phone: string | null; email: string | null; website: string | null; instagram: string | null; googleMaps: string | null; /** Online booking page of the restaurant itself. */ booking?: string | null; recommended: string | null; walkIn: string; advanceDays: string; suggestedArrival: string };
  };
  translations: Localized<PlaceCopy>;
}
export interface City {
  id: string; status: ContentStatus; photos: Photo[];
  translations: Localized<{ slug: string; name: string; intro: string; practical: { heading: string; text: string }[] }>;
  areas: { id: string; translations: Localized<{ slug: string; name: string; intro: string }> }[];
}
/** A dish on the partner menu. `allergens`/`vegetarian` are null until the restaurant confirms them. */
export interface Dish { id: string; allergens: string[] | null; vegetarian: boolean | null; translations: Localized<{ name: string; taste: string }>; }
export interface Offer {
  benefit?: {type:"fixed-amount";discountCents:number;scope:"partner-menu";campaignId:string;reference?:{menuPriceCents:number}};
  dishes?: Dish[];
  /** Section name of this menu on the restaurant's own printed menu, kept in Italian in every language. */
  menuSection?: string;
  /** Italian local times the menu can be eaten (lunch, dinner); shown on the coupon and to staff. */
  mealWindows?: { meal: "lunch" | "dinner"; from: string; to: string }[];
  photos?: Photo[];
  id: string; placeId: string; status: "coming-soon" | "paused" | "on-sale";
  version: number; priceCents: number | null; aLaCarteCents: number | null; currency: "EUR";
  people: number | null;
  /** How long a voucher or coupon lasts after it is bought or claimed: months, or days for short coupon campaigns. Exactly one. */
  validityMonths?: number; validityDays?: number; salesMode: "prepaid" | "pay-at-restaurant";
  translations: Localized<{ name: string; summary: string; conditions: string; allergens: string; courses: { name: string; description: string }[] }>;
}
export interface Guide {
  id: string; status: ContentStatus; cityId: string | null; type: "pitfalls" | "list" | "how-to" | "comparison" | "seasonal";
  placeIds: string[]; verifiedAt: string; audience: ("tourist" | "local")[]; photos: Photo[];
  translations: Localized<{ slug: string; title: string; description: string; introduction: string; sections: { heading: string; paragraphs: string[] }[] }>;
}
export interface Taxonomy {
  subcategories: Record<MainCategory, { id: string; names: Localized<string> }[]>;
  typeTags: { id: string; names: Localized<string> }[];
  sceneTags: { id: string; names: Localized<string> }[];
}
export interface Catalog { cities: City[]; places: Place[]; offers: Offer[]; guides: Guide[]; taxonomy: Taxonomy }
export interface RouteEntry {
  id: string; kind: "home" | "city" | "category" | "subcategory" | "place" | "guide" | "area" | "info" | "preview" | "commerce" | "experience" | "coupon";
  experiencePage?: import("../vouchers/experience-routes").ExperiencePageId;
  commercePage?: "checkout" | "result" | "email-help" | "success-preview";
  locale: Locale; path: string; cityId?: string; category?: MainCategory | "guides"; entityId?: string; subcategory?: string; purchaseBar?: boolean; /** Registry id of the page the header arrow returns to. */ parent?: string;
}
export type RouteRegistry = { id: string; paths: Partial<Record<Locale, string>>; kind: RouteEntry["kind"]; category?: RouteEntry["category"]; cityId?: string; purchaseBar?: boolean; parent?: string }[];
export interface PlaceFilters { subcategory?: string; area?: string; price?: string; tag?: string; offer?: boolean }
