import type { Metadata } from "next";
import { headers } from "next/headers";
import { htmlLanguages, isLocale, languageNames, locales } from "@/lib/i18n";
import { StatePanel } from "@/components/states/StatePanel";
import "./globals.css";
export const metadata: Metadata = { title: "404 | Palazzo Italia-Cina", robots: {index:false,follow:false} };
export default async function GlobalNotFound() {
  const requestHeaders=await headers(), value=requestHeaders.get("x-pci-locale"),locale=value && isLocale(value) ? value : "zh";
  return <html lang={htmlLanguages[locale]}><body><header className="fallback-header container"><a href={`/${locale}/`} lang="it">Palazzo Italia-Cina</a><nav aria-label={locale === "zh" ? "语言" : locale === "it" ? "Lingua" : "Language"}>{locales.map((other) => <a key={other} href={`/${other}/`} lang={htmlLanguages[other]}>{languageNames[other]}</a>)}</nav></header><StatePanel locale={locale} variant="missing" /></body></html>;
}
