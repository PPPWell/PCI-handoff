import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { Catalog, Photo, Place, RouteRegistry } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { contentCopy } from "@/lib/catalog/copy";
import { pathFor } from "@/lib/catalog/routes";
import {offerValue,priceBandLabel} from "@/lib/coupons/offer";
import { NoImage } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { PhotoCarousel } from "./PhotoCarousel";

export function PreviewNotice({ locale, active }: { locale: Locale; active: boolean }) {
  return active ? <p className="preview-notice small-copy">{contentCopy[locale].preview}</p> : null;
}
/** `wide` hides the trail on phones, where the header back arrow or the lit bottom tab already says where you are. */
export function Breadcrumbs({ items, locale, wide }: { items: { text: string; href?: string }[]; locale: Locale; wide?: boolean }) {
  return <nav className={wide ? "breadcrumbs breadcrumbs--wide" : "breadcrumbs"} aria-label={locale === "zh" ? "当前位置" : locale === "it" ? "Percorso" : "Breadcrumb"}><ol>{items.map((item, index) => <li key={`${item.text}-${index}`}>{item.href ? <Link href={item.href}>{item.text}</Link> : <span aria-current="page">{item.text}</span>}</li>)}</ol></nav>;
}
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section className="content-section" aria-labelledby={id}><h2 id={id}>{title}</h2>{children}</section>;
}
/** `subject` is the name already shown as the title: a credit that only repeats it is left out. */
export function Photograph({ photos, locale, fallback, monogram, hero = false, caption = true, priority = false, subject, carousel = false, coverFirst = false }: { photos: Photo[]; locale: Locale; fallback: string; monogram: string; hero?: boolean; caption?: boolean; priority?: boolean; subject?: string; carousel?: boolean; coverFirst?: boolean }) {
  const photo = photos[0], sizes = hero ? "(min-width: 960px) 50vw, 100vw" : "(min-width: 960px) 33vw, 100vw";
  // `carousel` turns several photos into a swipeable gallery; the first photo stays the one search results and shares use.
  if (photo && carousel && photos.length > 1) return <figure className={hero ? "photo-frame photo-frame--hero photo-frame--carousel" : "photo-frame photo-frame--carousel"}><PhotoCarousel slides={photos.map((p) => ({ src: p.url, alt: p.alt[locale] }))} locale={locale} sizes={sizes} priority={hero || priority} coverFirst={coverFirst} /></figure>;
  return photo ? <figure className={hero ? "photo-frame photo-frame--hero" : "photo-frame"}><Image src={photo.url} alt={photo.alt[locale]} fill sizes={sizes} priority={hero || priority} />{caption && photo.attribution !== subject && <figcaption>{photo.attribution}</figcaption>}</figure>
    : <NoImage label={fallback} monogram={monogram} />;
}
export function DisclosureBadge({ place, locale }: { place: Place; locale: Locale }) {
  const c = contentCopy[locale];
  if (place.facts.partnership === "independent") return null;
  return <span className={`disclosure-badge disclosure-badge--${place.facts.partnership}`}>{place.facts.partnership === "exclusive" ? c.exclusive : place.facts.partnership === "partner" ? c.partner : c.independent}</span>;
}
export function PlaceCard({ place, locale, registry, offer, catalog }: { place: Place; locale: Locale; registry: RouteRegistry; offer?: Catalog["offers"][number]; catalog: Catalog }) {
  const copy = place.translations[locale], href = pathFor(registry, `place:${place.id}`, locale)!, c = contentCopy[locale];
  const area = catalog.cities.find((city) => city.id === place.facts.cityId)?.areas.find((entry) => entry.id === place.facts.areaId)?.translations[locale]?.name;
  const type = catalog.taxonomy.subcategories[place.facts.category].find((term) => term.id === place.facts.subcategory)?.names[locale];
  const meta = [area, priceBandLabel(place.facts.priceBand, locale), type].filter(Boolean).join(" · ");
  return <article className="place-card card"><Link className="place-card-link" href={href}>
    {(place.facts.photos.length > 0 || copy.name.startsWith("[")) && <Photograph subject={place.facts.originalName} photos={place.facts.photos} locale={locale} fallback={`[${c.places}]`} monogram={copy.name.replace(/^\[/, "").slice(0, 1)} />}
    <div className="place-card-copy"><DisclosureBadge place={place} locale={locale} /><h3>{copy.name}</h3><p className="small-copy">{meta}</p><p>{copy.highlight}</p>
      {offer && <p className="card-offer">{offerValue(offer, locale)}</p>}
    </div></Link></article>;
}
export function SubscriptionCallout({ locale, registry }: { locale: Locale; registry: RouteRegistry }) {
  const c = contentCopy[locale];
  return <aside className="subscription-callout"><h2>{c.subscription}</h2><p className="small-copy">{c.subscribeClosed}</p><Link className="text-link" href={pathFor(registry, "info:subscribe", locale) ?? `/${locale}/#subscribe`}>{locale==="zh"?"订阅邮件更新":locale==="it"?"Ricevi gli aggiornamenti":"Get email updates"}<Icon name="arrow" /></Link></aside>;
}
