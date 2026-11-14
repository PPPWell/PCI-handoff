import {offerValue,discountLabels} from "@/lib/coupons/offer";
import Link from "next/link";
import type { Catalog, City, RouteRegistry } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { ui } from "@/lib/i18n";
import { categoryNames, isLaunched } from "@/lib/routes";
import { pathFor } from "@/lib/catalog/routes";
import { contentCopy } from "@/lib/catalog/copy";
import { cityPlaces, featuredGuides } from "@/lib/catalog/select";
import { Breadcrumbs, Photograph, PlaceCard, PreviewNotice, Section } from "./ContentShared";
import { Icon } from "@/components/ui/Icon";

export function CityPage({ city, catalog, locale, registry }: { city: City; catalog: Catalog; locale: Locale; registry: RouteRegistry }) {
  const c = contentCopy[locale], copy = city.translations[locale], places = cityPlaces(catalog, city.id, locale), guides = featuredGuides(catalog, locale).filter((guide) => guide.cityId === city.id);
  return <main id="main-content" className="content-page container" tabIndex={-1}>
    <Breadcrumbs wide locale={locale} items={[{ text: ui[locale].home, href: `/${locale}/` }, { text: copy.name }]} />
    <PreviewNotice locale={locale} active={city.status === "preview"} />
    <section className="city-lead"><div><p className="eyebrow" lang="it">Palazzo Italia-Cina</p><h1>{copy.name}</h1><p>{copy.intro}</p></div>{city.photos.length > 0 && <Photograph photos={city.photos} locale={locale} fallback={copy.name} monogram={copy.name.slice(0, 1)} hero caption={false} priority />}</section>
    <Section id="city-categories" title={c.browse}><nav className="category-grid" aria-label={c.browse}>{(["eat", "do", "shop", "stay"] as const).map((category) => {
      const href = pathFor(registry, `category:${city.id}:${category}`, locale), count = places.filter((place) => place.facts.category === category).length;
      return href ? <Link className="category-tile" key={category} href={href}><Icon name={category} /><h3>{categoryNames[locale][category]}</h3><span className="small-copy">{isLaunched(category) ? `${count} ${c.places}` : c.comingSoon}</span><Icon name="arrow" /></Link> : null;
    })}</nav></Section>
    <Section id="city-menus" title={c.cityMenus}><div className="menu-summary-grid">{catalog.offers.filter((offer) => places.some((place) => place.id === offer.placeId)).map((offer) => <Link className="menu-summary card" key={offer.id} href={pathFor(registry, `place:${offer.placeId}`, locale)!}><span className="eyebrow">{c.exclusive}</span><h3>{offer.translations[locale].name}</h3><p className="small-copy">{places.find((place) => place.id === offer.placeId)!.translations[locale].name}</p><span className="menu-summary__foot"><strong className="price">{offerValue(offer, locale)}</strong><span className="badge">{offer.status === "paused" ? c.paused : offer.benefit ? discountLabels[locale].free : c.soon}</span></span></Link>)}</div></Section>
    <Section id="city-selected" title={c.selected}><div className="place-grid">{places.filter((place) => place.facts.category === "eat").slice(0, 3).map((place) => <PlaceCard key={place.id} place={place} locale={locale} registry={registry} catalog={catalog} offer={catalog.offers.find((offer) => offer.placeId === place.id)} />)}</div></Section>
    {guides.length > 0 && <Section id="city-guides" title={categoryNames[locale].guides}><div className="guide-grid">{guides.map((guide) => <Link className="guide-card" key={guide.id} href={pathFor(registry, `guide:${guide.id}`, locale)!}><h3>{guide.translations[locale].title}</h3><p className="small-copy">{guide.translations[locale].description}</p><Icon name="arrow" /></Link>)}</div></Section>}
    <Section id="city-practical" title={c.practical}><div className="practical-grid">{copy.practical.map((section) => <article key={section.heading}><h3>{section.heading}</h3><p>{section.text}</p></article>)}</div></Section>
  </main>;
}
