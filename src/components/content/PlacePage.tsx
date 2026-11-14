import {discountLabels,priceBandLabel} from "@/lib/coupons/offer";
import { mapLinks } from "@/lib/catalog/maps";
import { bookingCopy } from "@/lib/coupons/ux";
import Link from "next/link";
import type { Catalog, Place, RouteRegistry } from "@/lib/catalog/types";
import { htmlLanguages, locales, ui, type Locale } from "@/lib/i18n";
import { categoryNames } from "@/lib/routes";
import { contentCopy } from "@/lib/catalog/copy";
import { pathFor } from "@/lib/catalog/routes";
import { containingGuides, relatedPlaces } from "@/lib/catalog/select";
import { Breadcrumbs, DisclosureBadge, Photograph, PlaceCard, PreviewNotice, Section } from "./ContentShared";
import { OfferPanel } from "./OfferPanel";
import { MenuTabs } from "./MenuTabs";
import { PendingButton } from "@/components/site/SiteInteractions";
import { CopyButton } from "./CopyButton";
import { OrderCheatSheet } from "./OrderGuide";
import { placeUx } from "@/lib/catalog/place-ux";

export function PlacePage({ place, catalog, locale, registry }: { place: Place; catalog: Catalog; locale: Locale; registry: RouteRegistry }) {
  const c = contentCopy[locale], u = placeUx[locale], copy = place.translations[locale], city = catalog.cities.find((city) => city.id === place.facts.cityId)!, offers = catalog.offers.filter((offer) => offer.placeId === place.id), offer = offers[0], couponOffers = offers.filter((offer) => offer.benefit);
  const complete = place.facts.category === "eat" && place.facts.profile === "complete";
  const lean = complete && couponOffers.length > 0;
  const brief = !complete && !copy.name.startsWith("[");
  const area = city.areas.find((area) => area.id === place.facts.areaId)!, related = relatedPlaces(catalog, place, locale), guides = containingGuides(catalog, place.id, locale), reservations = place.facts.reservations;
  const cityHref = pathFor(registry, `city:${city.id}`, locale)!, categoryHref = pathFor(registry, `category:${city.id}:${place.facts.category}`, locale);
  const recommended = (channel: string) => !lean && reservations.recommended === channel ? <span className="badge">{c.recommended}</span> : null;
  const directions = place.facts.coordinates ? `https://www.google.com/maps/dir/?api=1&destination=${place.facts.coordinates.lat},${place.facts.coordinates.lng}` : reservations.googleMaps ?? (brief ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.facts.originalName} ${place.facts.address}`)}` : null);
  const apple = mapLinks(place).apple, nearby = place.facts.nearby ?? [];
  const whySection = <Section id="place-why" title={c.why}>{copy.reasons.map((reason) => <p key={reason}>{reason}</p>)}<p>{copy.suitableFor}</p></Section>;
  const menuSection = complete && offer && !lean ? (<Section id="place-menu" title={c.menu}>
        {!lean && <div className="menu-courses">{offer.translations[locale].courses.map((course, index) => <article key={index}><h3>{course.name}</h3><p>{course.description}</p><div className="translated-courses">{locales.filter((other) => other !== locale).map((other) => <p key={other} lang={htmlLanguages[other]}>{offer.translations[other].courses[index]?.name} · {offer.translations[other].courses[index]?.description}</p>)}</div></article>)}</div>}
        <p className="small-copy"><strong>{c.allergens}：</strong>{offer.translations[locale].allergens}</p><p className="small-copy">{offer.translations[locale].conditions}</p>
      </Section>) : null;
  const orderSection = complete && offer?.benefit ? <Section id="place-order" title={u.cheatTitle}><OrderCheatSheet locale={locale} /></Section> : null;
  const reservationSection = <Section id="place-reservation" title={lean ? u.visit : complete || brief ? c.reservation : c.useful}>
        {(complete || brief) && <><div className="reservation-links">
          {reservations.booking && <a className="button button--primary" href={reservations.booking} rel="noopener noreferrer" data-track="booking_clicked" data-track-item="place">{bookingCopy[locale].label} {recommended("booking")}</a>}
          {reservations.whatsapp && <a className="button button--secondary" href={`https://wa.me/${reservations.whatsapp.replace(/\D/g, "")}`} rel="noopener noreferrer">WhatsApp {recommended("whatsapp")}</a>}
          {reservations.phone && <a className="button button--secondary" href={`tel:${reservations.phone}`}>{locale === "zh" ? "电话" : locale === "it" ? "Telefono" : "Phone"} {recommended("phone")}</a>}
          {reservations.email && <a className="text-link" href={`mailto:${reservations.email}`}>Email {recommended("email")}</a>}
          {reservations.website && !lean && <a className="text-link" href={reservations.website} rel="noopener noreferrer">{locale === "zh" ? "餐厅官网" : locale === "it" ? "Sito del ristorante" : "Restaurant website"} {recommended("website")}</a>}
          {reservations.instagram && <a className="text-link" href={reservations.instagram} rel="noopener noreferrer">Instagram {recommended("instagram")}</a>}
          {reservations.googleMaps && !lean && <a className="text-link" href={reservations.googleMaps} rel="noopener noreferrer">Google Maps {recommended("googleMaps")}</a>}
          {!reservations.recommended && <p>{c.contactPending}</p>}
        </div>{!offer?.benefit && <><p className="small-copy">{c.advance}：{reservations.advanceDays}</p><p className="small-copy">{c.walkIn}：{reservations.walkIn}</p></>}{!lean && <p className="small-copy">{c.arrival}：{reservations.suggestedArrival}</p>}</>}
        <dl className="facts-list"><div><dt>{c.address}</dt><dd><span lang="it">{place.facts.address}</span> <CopyButton trackAs="address_copied" text={place.facts.address} label={u.copyAddress} done={u.copied} className="button button--secondary copy-address" /></dd></div>{nearby.length>0&&<div><dt>{u.nearby}</dt><dd><ul className="nearby-list">{nearby.map((n)=><li key={n.landmark.it}>{n.landmark[locale]} · {u.approx} {n.minutes} {u.minutes}</li>)}</ul><small>{u.nearbyNote}</small></dd></div>}<div><dt>{c.hours}</dt><dd>{place.facts.openingHours.includes("[") ? `[${c.hours}]` : place.facts.openingHours}<small>{c.localTime}</small></dd></div>{!lean && place.facts.priceBand !== "unknown" && <div><dt>{c.price}</dt><dd>{place.facts.priceBand.includes("[") ? c.priceUnknown : priceBandLabel(place.facts.priceBand,locale)}</dd></div>}</dl>
        {directions ? <div className="map-links"><a className="button button--secondary" href={directions} rel="noopener noreferrer" data-track="directions_clicked" data-track-item="google">{lean ? u.openGoogle : <>{u.openGoogle} · {c.navigate}</>}</a>{apple&&<a className="button button--secondary" href={apple} rel="noopener noreferrer" data-track="directions_clicked" data-track-item="apple">{u.openApple}</a>}</div> : <p className="small-copy">{c.factsPending}</p>}
        {!lean && <p>{copy.practicalTips}</p>}
      </Section>;
  const support = pathFor(registry, "info:support", locale);
  const storySection = (complete || brief) && !lean ? <Section id="place-story" title={c.story}><p>{copy.story}</p></Section> : null;
  const stepsSection = complete && !lean ? <Section id="place-steps" title={c.how}><ol className="use-steps">{offer?.benefit ? discountLabels[locale].steps.map(step=><li key={step}>{step}</li>) : <><li>{c.buyStep}</li><li>{c.reserveStep}</li><li>{c.redeemStep}</li></>}</ol></Section> : null;
  const disclosureSection = !lean && place.facts.partnership !== "independent" ? <Section id="place-disclosure" title={c.disclosure}><DisclosureBadge place={place} locale={locale} /><p>{offer?.benefit?discountLabels[locale].scope:brief?({zh:"我们与这家店没有合作关系。",it:"Non abbiamo accordi con questo locale.",en:"We have no partnership with this restaurant."})[locale]:c.factsPending}</p>{pathFor(registry, "info:editorial-policy", locale) ? <Link className="text-link" href={pathFor(registry, "info:editorial-policy", locale)!}>{ui[locale].editorial}</Link> : <PendingButton>{ui[locale].editorial}</PendingButton>}</Section> : null;
  const panel = complete && !lean && offer ? <OfferPanel offer={offer} locale={locale} /> : null;
  return <main id="main-content" className="content-page container place-page" tabIndex={-1}>
    <Breadcrumbs wide locale={locale} items={[{ text: city.translations[locale].name, href: cityHref }, { text: categoryNames[locale][place.facts.category], href: categoryHref }, { text: copy.name }]} />
    <PreviewNotice locale={locale} active={place.status === "preview" && !offer?.benefit && !brief} />
    <div className="split">
      <header className="split__lead">
        {(place.facts.photos.length > 0 || !brief) && <Photograph subject={place.facts.originalName} photos={place.facts.photos} locale={locale} fallback={`[${c.places}]`} monogram={copy.name.replace(/^\[/, "").slice(0, 1)} hero carousel />}
        <div className="place-introduction"><DisclosureBadge place={place} locale={locale} /><h1>{copy.name}</h1>{place.facts.originalName !== copy.name && <p lang="it" className="original-name">{place.facts.originalName}</p>}<p>{copy.highlight}</p>{!lean && <p className="small-copy">{[area.translations[locale].name, priceBandLabel(place.facts.priceBand, locale)].filter(Boolean).join(" · ")}</p>}</div>
      </header>
      {lean && <div className="split__tabs"><MenuTabs offers={couponOffers} locale={locale} /></div>}
      {lean && orderSection && <div className="split__order">{orderSection}</div>}
      <div className="split__side">
        {panel}
        <div className="split__visit">{reservationSection}</div>
        <p className="split__feedback small-copy">{support ? <Link className="text-link" href={support}>{c.correction}</Link> : <PendingButton>{c.correction}</PendingButton>}</p>
      </div>
      <div className="split__main">
        {!lean && whySection}
        {storySection}
        {menuSection}
        {!lean && orderSection}
        {stepsSection}
        {disclosureSection}
        {!lean && guides.length > 0 && <Section id="place-guides" title={c.relatedGuides}><div className="article-links">{guides.map((guide) => <Link className="text-link" key={guide.id} href={pathFor(registry, `guide:${guide.id}`, locale)!}>{guide.translations[locale].title}</Link>)}</div></Section>}
      </div>
    </div>
    {!lean && related.length > 0 && <Section id="place-related" title={c.related}><div className="place-grid">{related.map((other) => <PlaceCard key={other.id} place={other} locale={locale} registry={registry} catalog={catalog} offer={catalog.offers.find((offer) => offer.placeId === other.id)} />)}</div></Section>}
  </main>;
}
