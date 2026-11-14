"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { stateCopy } from "@/lib/states/copy";

export function LoadingState({ locale, fullPage = true }: { locale: Locale; fullPage?: boolean }) {
  const c = stateCopy[locale], [slow, setSlow] = useState(false), Heading = fullPage ? "p" : "h3";
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 10000);return () => clearTimeout(timer); }, []);
  return <section role="status" className={`loading-state ${fullPage ? "container" : ""}`} tabIndex={fullPage ? -1 : undefined} aria-label={c.loading}>
    <Heading className="sr-only">{c.loading}</Heading><div className="skeleton-region" aria-busy="true" aria-hidden="true"><div className="skeleton skeleton--title" aria-hidden="true" /><div className="skeleton skeleton--line" aria-hidden="true" /><div className="skeleton skeleton--image" aria-hidden="true" /><div className="skeleton skeleton--line" aria-hidden="true" />
    </div>{slow && <p role="status">{c.slow} <button type="button" className="text-link" onClick={() => window.location.reload()}>{c.retry}</button></p>}
  </section>;
}
