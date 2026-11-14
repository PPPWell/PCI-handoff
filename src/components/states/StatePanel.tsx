import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { stateCopy } from "@/lib/states/copy";

export function StatePanel({ locale, variant, retry, fullPage = true }: { locale: Locale; variant: "missing" | "error" | "maintenance" | "empty"; retry?: () => void; fullPage?: boolean }) {
  const c = stateCopy[locale], Container = fullPage ? "main" : "section", Heading = fullPage ? "h1" : "h3";
  const title = variant === "missing" ? c.notFoundTitle : variant === "error" ? c.errorTitle : variant === "empty" ? c.emptyTitle : c.maintenanceTitle;
  const detail = variant === "missing" ? c.notFoundDetail : variant === "error" ? c.errorDetail : variant === "empty" ? c.emptyDetail : c.maintenanceDetail;
  return <Container id={fullPage ? "main-content" : undefined} className={`state-panel ${fullPage ? "state-panel--page container" : ""}`} tabIndex={fullPage ? -1 : undefined}>
    <p className="eyebrow" lang="it">Palazzo Italia-Cina</p><Heading>{title}</Heading><p>{detail}</p><div className="state-actions">
      {retry && <button type="button" className="button button--primary" onClick={retry}>{c.retry}</button>}
      {(variant === "missing" || variant === "empty") && <Link className="button button--secondary" href={`/${locale}/${locale === "it" ? "firenze" : "florence"}/`}>{c.browse}</Link>}
      <Link className="text-link" href={`/${locale}/`}>{c.home}</Link><Link className="text-link" href={`/${locale}/support/`}>{c.support}</Link>
    </div>
  </Container>;
}
