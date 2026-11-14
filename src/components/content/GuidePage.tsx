import Link from "next/link";
import type { Catalog, Guide, RouteRegistry } from "@/lib/catalog/types";
import { ui, type Locale } from "@/lib/i18n";
import { contentCopy } from "@/lib/catalog/copy";
import { availableGuides, cityPlaces } from "@/lib/catalog/select";
import { pathFor } from "@/lib/catalog/routes";
import { Breadcrumbs, Photograph, PlaceCard, PreviewNotice, Section, SubscriptionCallout } from "./ContentShared";

export function GuidePage({ guide, catalog, locale, registry }: { guide: Guide; catalog: Catalog; locale: Locale; registry: RouteRegistry }) {
  const c = contentCopy[locale], copy = guide.translations[locale], city = catalog.cities.find((city) => city.id === guide.cityId);
  const mentioned = catalog.cities.flatMap((city) => cityPlaces(catalog, city.id, locale)).filter((place) => guide.placeIds.includes(place.id));
  const body = [copy.introduction, ...copy.sections.flatMap((section) => [section.heading, ...section.paragraphs])].join(" ");
  const units = locale === "zh" ? body.replace(/\s/g, "").length / 400 : body.split(/\s+/).filter(Boolean).length / 200;
  const readTime = c.readTime.replace("{n}", String(Math.max(1, Math.round(units))));
  const more = availableGuides(catalog, locale).filter((other) => other.id !== guide.id && other.cityId === guide.cityId).slice(0, 3);
  return <main id="main-content" className="content-page article-page container" tabIndex={-1}>
    <Breadcrumbs wide locale={locale} items={[{ text: ui[locale].home, href: `/${locale}/` }, ...(city ? [{ text: city.translations[locale].name, href: pathFor(registry, `city:${city.id}`, locale) }] : [{ text: c.country }]), { text: c.guides, href: city ? pathFor(registry, `category:${city.id}:guides`, locale) ?? undefined : undefined }, { text: copy.title }]} />
    <PreviewNotice locale={locale} active={guide.status === "preview"} />
    <header className="article-heading"><p className="eyebrow">{c.guides}</p><h1>{copy.title}</h1><p className="small-copy">{c.editor} · {readTime}</p><p>{copy.description}</p></header>
    {guide.photos.length > 0 && <Photograph photos={guide.photos} locale={locale} fallback={`[${c.guides}]`} monogram={locale === "zh" ? "读" : "P"} />}
    <div className="article-body"><Section id="article-summary" title={c.summary}><p>{copy.introduction}</p></Section>{copy.sections.map((section, index) => <Section key={index} id={`article-section-${index}`} title={section.heading}>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</Section>)}</div>
    <Section id="article-mentioned" title={c.mentioned}><div className="place-grid">{mentioned.map((place) => <PlaceCard key={place.id} place={place} locale={locale} registry={registry} catalog={catalog} offer={catalog.offers.find((offer) => offer.placeId === place.id)} />)}</div></Section>
    {more.length > 0 && <Section id="article-more" title={c.moreGuides}><div className="article-links">{more.map((other) => <Link className="text-link" key={other.id} href={pathFor(registry, `guide:${other.id}`, locale)!}>{other.translations[locale].title}</Link>)}</div></Section>}
    <SubscriptionCallout locale={locale} registry={registry} />
  </main>;
}
