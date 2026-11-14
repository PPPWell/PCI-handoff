import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { htmlLanguages, isLocale, locales, ui } from "@/lib/i18n";
import { getHomeContent } from "@/lib/content";
import { getCatalog } from "@/lib/catalog/load";
import { getCatalogRoutes, makeRouteRegistry } from "@/lib/catalog/routes";
import { getNavigationMode, getVisibleCategories } from "@/lib/routes";
import { Header, BottomNavigation } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { SiteInteractions, SitePrompts } from "@/components/site/SiteInteractions";
import { ServiceWorker } from "@/components/site/ServiceWorker";
import type { Metadata } from "next";
import "../globals.css";

export const dynamicParams = false;
export function generateStaticParams() { return locales.map((lang) => ({ lang })); }

const jsFallback = {
  zh: "页面功能没有正常加载，按钮可能点不动。请用手机自带的浏览器（Safari、Chrome）打开本页，或更新浏览器后再试。",
  it: "Le funzioni della pagina non si sono caricate e i pulsanti potrebbero non rispondere. Apri la pagina nel browser del telefono (Safari, Chrome) o aggiorna il browser.",
  en: "The page's features did not load, so buttons may not respond. Open this page in your phone's own browser (Safari, Chrome) or update your browser.",
};

/** Every page can be added to the home screen as the customer app; the restaurant area overrides this with its own manifest. */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return { manifest: `/customer-${lang}.webmanifest`, appleWebApp: { capable: true, title: lang === "zh" ? "中意公馆" : "Palazzo", statusBarStyle: "default" } };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const content = getHomeContent(lang);
  const catalog = getCatalog(), registry = makeRouteRegistry(getCatalogRoutes(catalog));
  const categories = getVisibleCategories();
  const mode = getNavigationMode(categories);
  return <html lang={htmlLanguages[lang]}><head>
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preload" href="/fonts/fraunces-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <link rel="preload" href="/fonts/dm-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    {/* If the page's scripts have not started after 6 seconds (an old in-app browser that cannot run them), say so instead of
        leaving buttons that do nothing. SiteInteractions marks the page ready and hides this again. */}
    <script dangerouslySetInnerHTML={{ __html: "setTimeout(function(){var d=document.documentElement,b=document.getElementById('js-fallback');if(b&&d.getAttribute('data-js')!=='ready')b.removeAttribute('hidden')},6000)" }} />
  </head><body className={mode === "bottom" ? "has-bottom-nav" : undefined}>
    <div id="js-fallback" className="js-fallback" role="alert" hidden suppressHydrationWarning>{jsFallback[lang]}</div>
    <a href="#main-content" className="skip-link">{ui[lang].skip}</a>
    <SiteInteractions locale={lang} bottomNavigation={mode === "bottom"} registry={registry}>
      <Header locale={lang} categories={categories} navigationMode={mode} registry={registry} />
      <SitePrompts />
      <ServiceWorker />
      {children}
      <Footer content={content} registry={registry} />
      {mode === "bottom" && <BottomNavigation locale={lang} categories={categories} registry={registry} />}
    </SiteInteractions>
  </body></html>;
}
