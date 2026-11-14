import { isLocale, locales, type Locale } from "../i18n";
import type { RouteEntry } from "../catalog/types";
export function fallbackLocale(pathname: string): Locale { const segment=pathname.split("/")[1];return isLocale(segment) ? segment : "zh"; }
export function getStatePreviewRoutes(mode: "preview" | "published" = process.env.CONTENT_MODE === "published" ? "published" : "preview"): RouteEntry[] {
  return mode === "published" ? [] : locales.map((locale) => ({id:"preview:states",kind:"preview",locale,path:`/${locale}/preview/states/`}));
}
