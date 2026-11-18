import type { HomeContent } from "@/lib/content";
import { Card } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import {OfferCard} from "@/components/content/OfferCard";
import {claimPath} from "@/lib/coupons/offer";
import {mealWindowLabel} from "@/lib/coupons/ux";
import Link from "next/link";
import { InstallLink } from "@/components/site/InstallApp";
import {SubscribeForm} from "@/components/coupons/SubscribeForm";
import type { Catalog, RouteRegistry } from "@/lib/catalog/types";
import { pathFor } from "@/lib/catalog/routes";
import { contentCopy } from "@/lib/catalog/copy";
import { categoryIds, categoryNames, isLaunched } from "@/lib/routes";
import Image from "next/image";
import { DoorArt } from "./Illustrations";
import { ExtraDoorArt } from "./ExtraDoorArt";
import { cityPlaces, featuredGuides } from "@/lib/catalog/select";

const extra = {
  zh: { allGuides: "全部提示" },
  it: { allGuides: "Tutti i consigli" },
  en: { allGuides: "All guides" },
} as const;

/** Two new home-only entries; the existing catalog categories are intentionally unchanged. */
const extraDoors = ["tech", "presale"] as const;
const extraDoorLabels = {
  zh: { tech: "科技产品", presale: "预售" },
  it: { tech: "Tecnologia", presale: "Prevendita" },
  en: { tech: "Technology", presale: "Pre-sale" },
} as const;

export function Home({ content, catalog, registry }: { content: HomeContent; catalog: Catalog; registry: RouteRegistry }) {
  const { locale, hero, doors, offer, city, tips, team, subscribe } = content;
  const featuredOffer = catalog.offers.find((offer) => catalog.cities.some((city) => cityPlaces(catalog, city.id, locale).some((place) => place.id === offer.placeId)));
  // The featured restaurant's coupons: one per menu.
  const featuredOffers = catalog.offers.filter((offer) => offer.placeId === featuredOffer?.placeId);
  const guides = featuredGuides(catalog, locale);
  const guidesHub = pathFor(registry, "category:florence:guides", locale);
  // The photo runs edge to edge in its own colours; the statement sits below it, on the page, not over the picture.
  return <main id="main-content" className="home" tabIndex={-1}>
    <section className="hero hero--photo" aria-labelledby="home-title">
      <div className="hero__band"><Image className="hero__photo" src="/images/home/cinque-terre-manarola.jpg" alt={hero.imageAlt} fill priority sizes="100vw" /></div>
      <div className="container hero-copy">
        <p className="eyebrow"><span lang="it">PALAZZO</span><span className="eyebrow-rule" />{hero.eyebrow}</p>
        <h1 id="home-title" className="type-display">{hero.title}</h1>
        <p className="hero-description">{hero.description}</p>
      </div>
    </section>
    <div className="container home__body">

    <section className="home-band offer-section" aria-labelledby="offer-title">
      <h2 id="offer-title">{offer.heading}</h2>
      <p className="offer-place"><span lang="it">{offer.restaurant}</span> · {city.name}{featuredOffers[0]?.mealWindows?.length ? <> · <span className="offer-place__hours">{mealWindowLabel(featuredOffers[0].mealWindows, locale)}</span></> : null}</p>
      <Card className="offer-strip">
        {featuredOffers.length ? featuredOffers.map((entry) => <OfferCard key={entry.id} offer={entry} locale={locale} label={offer.notify} fallback={offer.imageLabel} href={claimPath(entry, locale) || pathFor(registry, "info:subscribe", locale)!} />) : <div className="offer-card">
          <div className="offer-card__body">
            <h3>{offer.name}</h3><strong className="price">{offer.price}</strong>
          </div>
          <Link className="button button--secondary offer-card__cta" href={pathFor(registry, "info:subscribe", locale)!}>{offer.notify}<Icon name="arrow" /></Link>
        </div>}
      </Card>
      {featuredOffer && <Link className="text-link" href={pathFor(registry, `place:${featuredOffer.placeId}`, locale)!}>{offer.restaurant}<Icon name="arrow" /></Link>}
    </section>

    <section className="home-band doors-section" aria-labelledby="doors-title">
      <h2 id="doors-title">{doors.heading}</h2>
      <ul className="door-list">{categoryIds.map((id) => {
        const href = pathFor(registry, `category:florence:${id}`, locale);
        const soon = !isLaunched(id);
        return href ? <li key={id}><Link className={soon ? "door door--soon" : "door"} href={href}>
          <DoorArt id={id} />
          <span className="door__body">
            <span className="door__name">{categoryNames[locale][id]}{locale !== "it" && <span className="door__it" lang="it">{categoryNames.it[id]}</span>}</span>
            <span className="door__note">{soon ? contentCopy[locale].comingSoon : doors.notes[id]}</span>
          </span>
        </Link></li> : null;
      })}
      {extraDoors.map((id) => <li key={id}>
        <Link className="door door--soon" href={`/${locale}/${id}/`}>
          <ExtraDoorArt id={id} />
          <span className="door__body">
            <span className="door__name">
              {extraDoorLabels[locale][id]}
              {locale !== "it" && <span className="door__it" lang="it">{extraDoorLabels.it[id]}</span>}
            </span>
            <span className="door__note">{contentCopy[locale].comingSoon}</span>
          </span>
        </Link>
      </li>)}
      </ul>
    </section>

    <section className="home-band city-section" aria-labelledby="city-title">
      <h2 id="city-title">{city.heading}</h2>
      <div className="city-row">
        <Link className="city-link" href={pathFor(registry, "city:florence", locale)!}>
          <span className="city-name">{city.name}</span>{locale === "zh" && <span className="caption" lang="it">{city.originalName}</span>}
          <span className="city-action">{city.action}<Icon name="arrow" /></span>
        </Link>
        <p className="upcoming-cities"><span className="eyebrow">{city.upcomingTitle}</span><span>{city.upcoming}</span></p>
      </div>
    </section>

    {guides.length > 0 && <section className="home-band tips-section" aria-labelledby="tips-title">
      <div className="section-heading"><h2 id="tips-title">{tips.heading}</h2>{guidesHub && <Link className="text-link" href={guidesHub}>{extra[locale].allGuides}<Icon name="arrow" /></Link>}</div>
      <div className="tip-list">{guides.map((guide) => <Link className="tip-card" key={guide.id} href={pathFor(registry, `guide:${guide.id}`, locale)!}><span className="tip-label">{categoryNames[locale].guides}</span><span className="tip-title">{guide.translations[locale].title}</span><Icon name="arrow" /></Link>)}</div>
    </section>}

    <section className="home-band story-section" aria-labelledby="team-title">
      <div className="story-copy">
        <p className="eyebrow" lang={locale === "zh" ? undefined : "it"}>{locale === "zh" ? "中意公馆" : "Palazzo Italia-Cina"}</p>
        <h2 id="team-title">{team.heading}</h2>
        <p>{team.description}</p>
      </div>
      {pathFor(registry, "info:about", locale) && <Link className="button button--secondary story-action" href={pathFor(registry, "info:about", locale)!}>{team.action}<Icon name="arrow" /></Link>}
    </section>

    <section className="home-band subscribe-section" aria-labelledby="subscribe-title"><h2 id="subscribe-title">{subscribe.title}</h2><p>{subscribe.description}</p><SubscribeForm locale={locale} /></section>
    <InstallLink locale={locale} />
    </div>
  </main>;
}
