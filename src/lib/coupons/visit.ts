import type { Offer, Photo, Place } from "../catalog/types";
import type { Locale } from "../i18n";
import { menuItems } from "../catalog/menu";
import { mapLinks } from "../catalog/maps";

/** What the coupon page shows about the menu and the way to the restaurant. Plain data, safe to hand to a client component. */
export interface CouponVisit { photo: Photo | null; dishes: string[]; windows: NonNullable<Offer["mealWindows"]>; claim: string | null; address: string; hours: string; google: string | null; apple: string | null; booking: string | null }

export function couponVisit(offer: Offer | undefined, place: Place | undefined, locale: Locale): CouponVisit | null {
  if (!place) return null;
  const maps = mapLinks(place);
  return {
    photo: offer?.photos?.[0] ?? null,
    dishes: offer ? menuItems(offer.translations[locale].courses[0].description).slice(0, 3) : [],
    windows: offer?.mealWindows ?? [],
    // Each visit uses one coupon; an account can claim a menu twice in all (the database enforces it).
    claim: offer?.benefit ? `/${locale}/claim/${offer.benefit.campaignId}/` : null,
    address: place.facts.address,
    hours: place.facts.openingHours,
    google: maps.google,
    apple: maps.apple,
    booking: place.facts.reservations.booking ?? null,
  };
}
