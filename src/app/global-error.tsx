"use client";
import { useSyncExternalStore } from "react";
import { htmlLanguages, type Locale } from "@/lib/i18n";
import { fallbackLocale } from "@/lib/states/routes";
import { stateCopy } from "@/lib/states/copy";
import { StatePanel } from "@/components/states/StatePanel";
import "./globals.css";
const subscribe=()=>()=>{};
const snapshot=()=>fallbackLocale(window.location.pathname);
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const locale=useSyncExternalStore(subscribe,snapshot,(): Locale=>"zh");
  return <html lang={htmlLanguages[locale]}><head><title>{stateCopy[locale].errorTitle} | Palazzo Italia-Cina</title><meta name="robots" content="noindex,nofollow" /></head><body><StatePanel locale={locale} variant="error" retry={retry} /></body></html>;
}
