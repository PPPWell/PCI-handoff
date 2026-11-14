"use client";
import { showDialog, closeDialog } from "@/lib/dialog";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { analyticsEnabled, browserStorage, CONSENT_KEY, LANGUAGE_KEY, getEffectiveConsent, writeConsent, type ConsentRecord } from "@/lib/consent";
import { languageNames, ui, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { usePathname } from "next/navigation";
import type { RouteRegistry } from "@/lib/catalog/types";
import Link from "next/link";
import { pathFor, normalizePath, resolveLanguagePath } from "@/lib/catalog/routes";
import { detectInAppBrowser } from "@/lib/catalog/in-app";
import { forgetVisitor, track } from "@/lib/analytics";
import { reportConsentChoice } from "@/lib/consent-tally";
import { AnalyticsEvents } from "./AnalyticsEvents";

const Context = createContext<{ openPending: (trigger: HTMLElement) => void; openPrivacy: () => void; locale: Locale; app: string | null; suggestion: Locale | null; suggestionPath: string; dismissPrompt: () => void } | null>(null);
function useSite() {
  const context = useContext(Context);
  if (!context) throw new Error("Site controls require SiteInteractions");
  return context;
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("pci:privacy", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("pci:privacy", listener); };
}
function snapshot() {
  try { return JSON.stringify([browserStorage()?.getItem(CONSENT_KEY) ?? null, browserStorage()?.getItem(LANGUAGE_KEY) ?? null]); }
  catch { return "[null,null]"; }
}
const serverSnapshot = () => "server";

export function SiteInteractions({ children, locale, bottomNavigation, registry }: { children: ReactNode; locale: Locale; bottomNavigation: boolean; registry: RouteRegistry }) {
  const text = ui[locale];
  const pathname = usePathname(), current = registry.find((entry) => entry.paths[locale] === normalizePath(pathname));
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const ready = state !== "server";
  const [sessionChoice, setSessionChoice] = useState<ConsentRecord | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [appDismissed, setAppDismissed] = useState(false);
  const consent = ready ? getEffectiveConsent(sessionChoice) : null;
  const showCookies = analyticsEnabled && ready && !consent && !privacyOpen;
  const prefs = useRef<HTMLDialogElement>(null);
  const [analyticsDraft, setAnalyticsDraft] = useState(false);
  // Tells the layout's 6-second check that the scripts are running.
  useEffect(() => { document.documentElement.setAttribute("data-js", "ready"); document.getElementById("js-fallback")?.setAttribute("hidden", ""); }, []);
  useEffect(() => {
    const el = prefs.current;
    if (!el) return;
    if (privacyOpen && !el.open) { setAnalyticsDraft(consent?.analytics ?? false); showDialog(el); }
    if (!privacyOpen && el.open) closeDialog(el);
  }, [privacyOpen, consent?.analytics]);
  const app = ready && !showCookies && !privacyOpen && !appDismissed && current?.kind === "place" && current.category === "eat" ? detectInAppBrowser(navigator.userAgent, locale) : null;
  // The language switcher in the header is enough; no "this page is also available in…" banner.
  const suggestion: Locale | null = null;

  function choose(analytics: boolean) {
    const record: ConsentRecord = { version: 1, analytics, updatedAt: new Date().toISOString() };
    const saved = writeConsent(record);
    setSessionChoice(saved ? record : { ...record, analytics: false });
    setStorageFailed(!saved);
    setPrivacyOpen(false);
    window.dispatchEvent(new Event("pci:privacy"));
    // Only an acceptance can be sent (track() drops everything else); a withdrawal also forgets the visitor id.
    if (analytics && saved) track("cookie_choice", { analytics: true }); else forgetVisitor();
    reportConsentChoice(analytics && saved ? "accept" : "reject");
  }

  return <Context.Provider value={{ locale, app, suggestion, suggestionPath: suggestion ? resolveLanguagePath(pathname, suggestion, registry) : "", dismissPrompt: () => setAppDismissed(true), openPrivacy: () => setPrivacyOpen(true), openPending: (trigger) => {
    const details = trigger.closest("details");
    restoreFocus.current = details?.querySelector("summary") ?? trigger;
    details?.removeAttribute("open");
    showDialog(dialog.current);
  } }}>
    {children}
    <AnalyticsEvents kind={current?.kind} slug={current?.paths[locale]?.split("/").filter(Boolean).pop()} />
    {showCookies && <aside className={`cookie-banner ${bottomNavigation && !current?.purchaseBar ? "cookie-banner--with-nav" : ""}`} aria-label={text.cookieTitle}>
      <button type="button" className="icon-button cookie-close" aria-label={text.cookieDismiss} onClick={() => choose(false)}><Icon name="close" /></button>
      <p className="small-copy">{text.cookieText} {text.cookieContinue} {pathFor(registry, "info:legal/cookies", locale) && <Link className="text-link" href={pathFor(registry, "info:legal/cookies", locale)!}>{text.cookieMore}</Link>}</p>
      <div className="cookie-actions"><Button variant="secondary" onClick={() => choose(false)}>{text.reject}</Button><Button variant="secondary" onClick={() => choose(true)}>{text.accept}</Button><button type="button" className="text-link cookie-customize" onClick={() => setPrivacyOpen(true)}>{text.cookieCustomize}</button></div>
    </aside>}
    <dialog ref={prefs} className="notice-dialog cookie-prefs" aria-labelledby="cookie-prefs-title" onClose={() => setPrivacyOpen(false)}>
      <h2 id="cookie-prefs-title" className="type-h2">{text.cookieTitle}</h2>
      <p>{text.cookiePrefsIntro}</p>
      <label className="cookie-row"><span><strong>{text.cookieNecessary}</strong><small>{text.cookieNecessaryText}</small></span><input type="checkbox" checked disabled /></label>
      <label className="cookie-row"><span><strong>{text.cookieAnalytics}</strong><small>{text.cookieAnalyticsText}</small></span><input type="checkbox" checked={analyticsDraft} onChange={(event) => setAnalyticsDraft(event.target.checked)} /></label>
      {pathFor(registry, "info:legal/cookies", locale) && <Link className="text-link" href={pathFor(registry, "info:legal/cookies", locale)!} onClick={() => setPrivacyOpen(false)}>{text.cookiePolicyLink}</Link>}
      <div className="cookie-actions"><Button variant="secondary" onClick={() => choose(false)}>{text.reject}</Button><Button variant="primary" onClick={() => choose(analyticsDraft)}>{text.cookieSave}</Button><Button variant="secondary" onClick={() => choose(true)}>{text.accept}</Button></div>
    </dialog>
    {storageFailed && <p className="storage-note" role="status">{text.storageNotice}</p>}
    <dialog ref={dialog} className="notice-dialog" aria-labelledby="pending-title" onClose={() => restoreFocus.current?.focus()} onClick={(event) => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog.current);
      }
    }}>
      <h2 id="pending-title" className="type-h2">{text.comingSoon}</h2>
      <p>{text.preparing}</p>
      <Button onClick={() => closeDialog(dialog.current)}>{text.okay}</Button>
    </dialog>
  </Context.Provider>;
}

export function PendingButton({ className = "text-link", children, ...props }: Omit<ComponentPropsWithoutRef<"button">, "onClick">) {
  const site = useSite();
  return <button type="button" className={className} title={ui[site.locale].comingSoon} {...props} onClick={(event) => site.openPending(event.currentTarget)}>{children}</button>;
}
export function CookieSettingsButton({className = "text-link"}: {className?: string}) {
  const site = useSite();
  if (!analyticsEnabled) return null;
  return <button type="button" className={className} onClick={site.openPrivacy}>{ui[site.locale].cookieSettings}</button>;
}
export function SitePrompts() {
  const site = useSite(), text = ui[site.locale];
  if (!site.app && !site.suggestion) return null;
  const instructions = site.locale === "zh" ? "验证邮箱时请不要切走本页面；也可用手机浏览器打开。" : site.locale === "it" ? "Durante la verifica dell’email non cambiare app; puoi anche aprire la pagina nel browser del telefono." : "Stay on this page while verifying your email, or open it in your phone browser.";
  return <aside className="inline-prompt container" aria-label={site.app ?? text.language}>
    {site.app ? <p>{site.app} · {instructions}</p> : <><p lang={site.suggestion!}>{ui[site.suggestion!].languageSuggestion}</p><a className="text-link" href={site.suggestionPath} lang={site.suggestion!} onClick={site.dismissPrompt}>{languageNames[site.suggestion!]}<Icon name="arrow" /></a></>}
    <button type="button" className="icon-button" aria-label={text.close} onClick={site.dismissPrompt}><Icon name="close" /></button>
  </aside>;
}
