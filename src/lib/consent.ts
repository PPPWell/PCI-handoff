import { isLocale, type Locale } from "./i18n";
export const CONSENT_KEY = "pci:consent:v1";
/** No analytics tool is installed yet, so there is nothing to consent to: no banner, no settings link. Set to "true" when one is added (and update the cookie policy first). */
export const analyticsEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";
/** Italian DPA guidance: ask again after about six months. */
export const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
export type ConsentRecord = { version: 1; analytics: boolean; updatedAt: string };
export type ConsentStorage = Pick<Storage, "getItem" | "setItem">;
export const LANGUAGE_KEY = "pci:language-choice:v1";
export function browserStorage(): ConsentStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
export function readConsent(storage: ConsentStorage | null = browserStorage()): ConsentRecord | null {
  try {
    const record: unknown = JSON.parse(storage?.getItem(CONSENT_KEY) ?? "null");
    if (!record || typeof record !== "object") return null;
    const value = record as Partial<ConsentRecord>;
    return value.version === 1 && typeof value.analytics === "boolean" && typeof value.updatedAt === "string"
      && Number.isFinite(Date.parse(value.updatedAt)) && Date.now() - Date.parse(value.updatedAt) < CONSENT_MAX_AGE_MS ? value as ConsentRecord : null;
  } catch { return null; }
}
export function writeConsent(record: ConsentRecord, storage: ConsentStorage | null = browserStorage()): boolean {
  try { if (!storage) return false; storage.setItem(CONSENT_KEY, JSON.stringify(record)); return true; } catch { return false; }
}
export function getEffectiveConsent(sessionChoice: ConsentRecord | null, storage: ConsentStorage | null = browserStorage()): ConsentRecord | null {
  return sessionChoice ?? readConsent(storage);
}
export function rememberLanguageChoice() {
  try { browserStorage()?.setItem(LANGUAGE_KEY, "chosen"); } catch { /* The choice still works without persistence. */ }
}
export function getSuggestedLocale(languages: readonly string[], current: Locale): Locale | null {
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (isLocale(base)) return base === current ? null : base;
  }
  return null;
}
