"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { categoryNames, type CategoryId } from "@/lib/routes";
import { htmlLanguages, languageNames, locales, ui, type Locale } from "@/lib/i18n";
import { rememberLanguageChoice } from "@/lib/consent";
import { PendingButton } from "./SiteInteractions";
import { Icon } from "@/components/ui/Icon";
import type { RouteRegistry } from "@/lib/catalog/types";
import { normalizePath, pathFor, resolveLanguagePath } from "@/lib/catalog/routes";
import { contentCopy } from "@/lib/catalog/copy";

export function Brand({ locale }: { locale: Locale }) {
  return <a className="brand" href={`/${locale}/`} aria-label={`${locale === "zh" ? "中意公馆" : "Palazzo Italia-Cina"} · ${ui[locale].home}`}>
    <svg className="brand-mark" width="28" height="36" viewBox="0 0 28 36" fill="none" aria-hidden="true"><path d="M2 34V15a12 12 0 0 1 24 0v19H2Z" stroke="var(--brass)" strokeWidth="1.5" /><path d="M8 34V15a6 6 0 0 1 12 0v19" stroke="currentColor" strokeWidth="1.5" /></svg>
    <span className="brand-copy"><span className="brand-chinese" lang="zh-CN">中意公馆</span><span className="brand-latin" lang="it">Palazzo Italia-Cina</span></span>
  </a>;
}

function closeOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); }
}

function NavigationLink({ href, className, children, current }: { href?: string; className: string; children: ReactNode; current?: boolean }) {
  return href ? <Link href={href} className={className} aria-current={current ? "true" : undefined} onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>{children}</Link> : <PendingButton className={className}>{children}</PendingButton>;
}
/** Signed-in email for the header: pages are static and the session cookie is HttpOnly, so ask the server once per page load. */
function useSignedInEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me/", { cache: "no-store", credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then((body: { email?: unknown } | null) => {
      if (live && typeof body?.email === "string") setEmail(body.email);
    }).catch(() => { /* Unknown means signed out: the button still opens the account page. */ });
    return () => { live = false; };
  }, []);
  return email;
}

/** `languageLinks` replaces the catalog lookup on pages outside it (the coupon page keeps its token and switches with ?lang=). */
export function Header({ locale, categories, navigationMode, registry, languageLinks }: { locale: Locale; categories: CategoryId[]; navigationMode: "horizontal" | "bottom"; registry: RouteRegistry; languageLinks?: Record<Locale, string> }) {
  const controls = useRef<HTMLDivElement>(null);
  const email = useSignedInEmail();
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !controls.current?.contains(event.target)) {
        controls.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details => { details.open = false; });
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const text = ui[locale], pathname = usePathname(), current = registry.find((entry) => entry.paths[locale] === normalizePath(pathname));
  const cityId = current?.cityId ?? "florence";
  const categoryPath = (id: CategoryId) => pathFor(registry, `category:${cityId}:${id}`, locale);
  // Policy pages sit under the policy index; on phones the arrow replaces the hidden breadcrumbs.
  const policy = /^\/(?:zh|it|en)\/legal\/[^/]+\/?$/.test(pathname ?? "");
  // A coupon page returns to the wallet it is listed in (staff views hide this header).
  const coupon = /^\/c\/[^/]+\/?$/.test(pathname ?? "");
  const back = current?.kind === "place" || current?.kind === "guide" ? (current.category ? categoryPath(current.category) : undefined) ?? pathFor(registry, `city:${cityId}`, locale) ?? `/${locale}/` : current?.parent ? pathFor(registry, current.parent, locale) ?? null : policy ? `/${locale}/legal/` : coupon ? `/${locale}/account/` : null;
  return <>
    <header className="site-header"><div className="header-inner container">
      <div className="header-brand-group">{back && <Link className="icon-button header-back" href={back} aria-label={contentCopy[locale].back}><Icon name="arrow" /></Link>}<Brand locale={locale} /></div>
      <nav className="desktop-nav" aria-label={text.navigation}>
        {categories.map((id) => <NavigationLink className="nav-link" key={id} href={categoryPath(id)} current={current?.category === id}>{categoryNames[locale][id]}</NavigationLink>)}
      </nav>
      <div className="header-controls" ref={controls}>
        <details name="header-popover" className="language-details" onKeyDown={closeOnEscape}>
          <summary className="language-button" aria-label={`${text.language}: ${languageNames[locale]}`}><Icon name="globe" /><span className="language-abbreviation">{locale === "zh" ? "中文" : locale.toUpperCase()}</span><span className="language-full">{languageNames[locale]}</span></summary>
          <div className="dropdown language-dropdown">
            {locales.map((language) => <Link className="dropdown-link" key={language} href={languageLinks?.[language] ?? resolveLanguagePath(pathname, language, registry)} lang={htmlLanguages[language]} hrefLang={htmlLanguages[language]} aria-current={language === locale ? "page" : undefined} onClick={(event) => {
              rememberLanguageChoice(); event.currentTarget.closest("details")?.removeAttribute("open");
            }}>{languageNames[language]}{language === locale && <Icon name="check" />}</Link>)}
          </div>
        </details>
        <Link href={pathFor(registry,"experience:account",locale)??`/${locale}/account/`} className={`account-button${email ? " account-button--in" : ""}`} aria-label={email ? `${text.account}: ${email}` : text.login}><Icon name="account" />{email ? <span className="account-button__name">{email.split("@")[0]}</span> : <span>{text.login}</span>}</Link>
      </div>
    </div></header>
    {navigationMode === "horizontal" && !/^\/(zh|it|en)\/merchant(?:\/|$)/.test(pathname) && <nav className="horizontal-nav container" aria-label={text.mobileNavigation}>{categories.map((id) => <NavigationLink className="nav-link" href={categoryPath(id)} key={id} current={current?.category === id}>{categoryNames[locale][id]}</NavigationLink>)}</nav>}
  </>;
}

export function BottomNavigation({ locale, categories, registry }: { locale: Locale; categories: CategoryId[]; registry: RouteRegistry }) {
  const pathname = usePathname(), current = registry.find((entry) => entry.paths[locale] === normalizePath(pathname));
  if (current?.purchaseBar || /^\/(zh|it|en)\/merchant(?:\/|$)/.test(pathname)) return null;
  return <nav className="bottom-nav" aria-label={ui[locale].mobileNavigation}>{categories.map((id) => <NavigationLink className="bottom-nav-link" key={id} href={pathFor(registry, `category:${current?.cityId ?? "florence"}:${id}`, locale)} current={current?.category === id}><Icon name={id} /><span>{categoryNames[locale][id]}</span></NavigationLink>)}</nav>;
}
