import type { Place } from "./types";

/**
 * Map links for a place. Apple Maps gets the exact point plus the place's name (`ll` + `q`), so the pin is labelled
 * "PaStation Firenze" rather than with the nearest address Apple finds for a bare coordinate — in Florence that is
 * often a black (residential) number next to the shop's red one, which reads as the wrong place.
 */
export function mapLinks(place: Place): { google: string | null; apple: string | null } {
  const at = place.facts.coordinates;
  if (!at) return { google: place.facts.reservations.googleMaps ?? null, apple: null };
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${at.lat},${at.lng}`,
    apple: `https://maps.apple.com/?ll=${at.lat},${at.lng}&q=${encodeURIComponent(place.facts.originalName)}`,
  };
}
