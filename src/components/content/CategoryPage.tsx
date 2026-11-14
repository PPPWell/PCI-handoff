import Link from "next/link";
import type { Catalog, RouteEntry, RouteRegistry } from "@/lib/catalog/types";
import { ui } from "@/lib/i18n";
import { categoryNames, isLaunched } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";
import { contentCopy } from "@/lib/catalog/copy";
import { pathFor } from "@/lib/catalog/routes";
import { cityPlaces, availableGuides } from "@/lib/catalog/select";
import { Breadcrumbs, PreviewNotice } from "./ContentShared";
import { PlaceList } from "./PlaceList";

export function CategoryPage({ route, catalog, registry }: { route: RouteEntry; catalog: Catalog; registry: RouteRegistry }) {
  const locale = route.locale, c = contentCopy[locale], city = catalog.cities.find((city) => city.id === route.cityId)!, category = route.category!;
  const subcategory = category === "guides" ? undefined : catalog.taxonomy.subcategories[category].find((term) => term.id === route.subcategory);
  const title = `${subcategory?.names[locale] ?? categoryNames[locale][category]} · ${city.translations[locale].name}`;
  if (!isLaunched(category)) return <main id="main-content" className="content-page container" tabIndex={-1}>
    <header className="page-introduction coming-soon"><span className="badge">{c.comingSoon}</span><h1>{categoryNames[locale][category]} · {city.translations[locale].name}</h1><p>{c.comingSoonLead}</p>
      <div className="coming-soon__actions"><Link className="button button--primary" href={pathFor(registry, `category:${city.id}:eat`, locale)!}>{c.comingSoonEat}<Icon name="arrow" /></Link><Link className="button button--secondary" href={pathFor(registry, "info:subscribe", locale) ?? `/${locale}/subscribe/`}>{c.comingSoonNotify}</Link></div>
    </header>
  </main>;
  return <main id="main-content" className="content-page container" tabIndex={-1}>
    <Breadcrumbs wide locale={locale} items={[{ text: ui[locale].home, href: `/${locale}/` }, { text: city.translations[locale].name, href: pathFor(registry, `city:${city.id}`, locale) }, { text: categoryNames[locale][category], href: subcategory ? pathFor(registry, `category:${city.id}:${category}`, locale) : undefined }, ...(subcategory ? [{ text: subcategory.names[locale] }] : [])]} />
    <PreviewNotice locale={locale} active={city.status === "preview"} />
    <header className="page-introduction"><h1>{title}</h1><p>{city.translations[locale].intro}</p></header>
    {category === "guides" ? <div className="guide-grid">{availableGuides(catalog, locale).filter((guide) => guide.cityId === city.id || guide.cityId === null).map((guide) => <Link className="guide-card" key={guide.id} href={pathFor(registry, `guide:${guide.id}`, locale)!}><p className="eyebrow">{guide.cityId === null ? c.country : city.translations[locale].name}</p><h2>{guide.translations[locale].title}</h2><p>{guide.translations[locale].description}</p></Link>)}</div>
      : <PlaceList places={cityPlaces(catalog, city.id, locale).filter((place) => place.facts.category === category)} catalog={catalog} locale={locale} registry={registry} category={category} cityId={city.id} subcategory={route.subcategory} />}
  </main>;
}
