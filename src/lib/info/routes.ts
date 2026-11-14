import { locales } from "../i18n";
import type { RouteEntry } from "../catalog/types";

export const infoPageIds = ["about", "editorial-policy", "partners", "help", "support", "subscribe", "subscribe/confirm", "subscribe/unsubscribe", "legal", "legal/terms", "legal/refunds", "legal/privacy", "legal/cookies"] as const;
export type InfoPageId = typeof infoPageIds[number];
export const legalPageIds = ["legal/terms", "legal/refunds", "legal/privacy", "legal/cookies"] as const;
export function isInfoPageId(value: string): value is InfoPageId { return infoPageIds.some((id) => id === value); }
export function privateInfoPage(id: string): boolean { return id === "subscribe/confirm" || id === "subscribe/unsubscribe"; }
export function getInfoRoutes(): RouteEntry[] { return locales.flatMap((locale) => infoPageIds.map((id) => ({ id: `info:${id}`, entityId: id, kind: "info", locale, path: `/${locale}/${id}/` }))); }
