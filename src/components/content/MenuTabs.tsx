"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Offer } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { Photograph } from "@/components/content/ContentShared";
import { pendingPhoto } from "@/components/content/MenuCard";
import { menuItems } from "@/lib/catalog/menu";
import { claimPath, discountLabels, offerValue } from "@/lib/coupons/offer";
import { couponPricing, mealWindowLabel } from "@/lib/coupons/ux";

const copy = {
  zh: { title: "免费领取优惠券", details: "套餐详情", notes: "领取须知", claim: "免费领取优惠券", short: "免费领取", all: (n: number) => `查看全部 ${n} 道` },
  it: { title: "Richiedi il coupon gratuito", details: "Dettagli del menù", notes: "Prima di richiedere", claim: "Richiedi il coupon gratuito", short: "Richiedi", all: (n: number) => `Tutte le ${n} portate` },
  en: { title: "Get the free coupon", details: "Menu details", notes: "Before you claim", claim: "Get the free coupon", short: "Claim", all: (n: number) => `All ${n} items` },
} as const;

/**
 * The restaurant's coupons as tabs, one tab per menu: photo, saving and price, the dishes, the terms and the claim button.
 * A floating bar with the open menu's price and button shows while the main button is off screen.
 */
export function MenuTabs({ offers, locale }: { offers: Offer[]; locale: Locale }) {
  const c = copy[locale], labels = discountLabels[locale], base = useId();
  const [active, setActive] = useState(0), [floating, setFloating] = useState(false);
  const root = useRef<HTMLDivElement>(null), tabs = useRef<(HTMLButtonElement | null)[]>([]), cta = useRef<HTMLAnchorElement | null>(null);

  // "#menu-2" opens the second tab, so a menu can be linked to directly.
  useEffect(() => {
    const open = () => {
      const index = Number(/^#menu-(\d+)$/.exec(window.location.hash)?.[1]) - 1;
      if (Number.isInteger(index) && index >= 0 && index < offers.length) setActive(index);
    };
    const frame = requestAnimationFrame(open);
    window.addEventListener("hashchange", open);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", open); };
  }, [offers.length]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = root.current?.getBoundingClientRect(), button = cta.current?.getBoundingClientRect();
      if (!box || !button) return;
      const reached = box.top < window.innerHeight * 0.6, buttonOnScreen = button.bottom > 0 && button.top < window.innerHeight;
      setFloating(reached && !buttonOnScreen);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); if (frame) cancelAnimationFrame(frame); };
  }, [active]);

  function select(index: number, focus = false) {
    setActive(index);
    window.history.replaceState(null, "", `#menu-${index + 1}`);
    if (focus) tabs.current[index]?.focus();
  }
  function onKey(event: KeyboardEvent, index: number) {
    const last = offers.length - 1, next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    select(next, true);
  }

  const current = offers[active], currentCourse = current.translations[locale].courses[0], currentPricing = couponPricing(current, locale);
  return <div id="place-menu" ref={root} className="menu-tabs">
    <h2 className="menu-tabs__title">{c.title}</h2>
    <div className="menu-tabs__list" role="tablist" aria-label={c.title}>
      {offers.map((offer, index) => <button key={offer.id} ref={(node) => { tabs.current[index] = node; }} type="button" role="tab" id={`${base}-tab-${index}`} aria-selected={active === index} aria-controls={`${base}-panel-${index}`} tabIndex={active === index ? 0 : -1} className="menu-tabs__tab" onClick={() => select(index)} onKeyDown={(event) => onKey(event, index)}>{offer.translations[locale].courses[0].name}</button>)}
    </div>
    {offers.map((offer, index) => {
      const course = offer.translations[locale].courses[0], pricing = couponPricing(offer, locale), items = menuItems(course.description), italianItems = menuItems(offer.translations.it.courses[0].description), target = claimPath(offer, locale);
      return <div key={offer.id} role="tabpanel" id={`${base}-panel-${index}`} aria-labelledby={`${base}-tab-${index}`} hidden={active !== index} className="menu-tabs__panel">
        <div className="menu-tabs__media">
          <Photograph photos={offer.photos ?? []} locale={locale} fallback={pendingPhoto[locale]} monogram="P" caption={false} priority={index === 0} carousel coverFirst />
        </div>
        <div className="menu-tabs__info">
        <div className="menu-tabs__price">
          <strong className="offer-discount">{offerValue(offer, locale)}</strong>
          {pricing && <p className="offer-price"><span className="offer-price__pay">{pricing.coupon}</span><s className="offer-price__list">{pricing.menu}</s></p>}
        </div>
        {offer.mealWindows?.length ? <p className="menu-tabs__hours">{mealWindowLabel(offer.mealWindows, locale)}</p> : null}
        {target && offer.status !== "paused" && <Link ref={index === active ? cta : undefined} className="button button--primary menu-tabs__cta" href={target}>{c.claim}<Icon name="arrow" /></Link>}
        <section className="menu-tabs__section" aria-label={c.details}>
          <h3>{c.details}</h3>
          {/* Three dishes are enough to judge the menu; the rest is one tap away. */}
          <ul className="menu-items">{items.slice(0, 3).map((item, i) => <li key={i}>
            <span className="menu-items__it" lang="it">{italianItems[i] ?? item}</span>
            {locale !== "it" && <span className="menu-items__gloss">{item}</span>}
          </li>)}</ul>
          {items.length > 3 && <details className="menu-tabs__more"><summary>{c.all(items.length)}</summary>
            <ul className="menu-items">{items.slice(3).map((item, i) => <li key={i}>
              <span className="menu-items__it" lang="it">{italianItems[i + 3] ?? item}</span>
              {locale !== "it" && <span className="menu-items__gloss">{item}</span>}
            </li>)}</ul>
          </details>}
        </section>
        <details className="menu-tabs__more menu-tabs__notes-fold">
          <summary>{c.notes}</summary>
          <ul className="menu-tabs__notes">
            <li>{offer.translations[locale].conditions}</li>
            <li>{labels.pay}</li>
            <li>{offer.translations[locale].allergens}</li>
          </ul>
        </details>
        </div>
      </div>;
    })}
    {floating && currentPricing && claimPath(current, locale) && <aside className="menu-float" aria-label={c.title}>
      <span><strong>{currentCourse.name}</strong><span className="menu-float__price">{currentPricing.coupon} <s>{currentPricing.menu}</s></span></span>
      <Link className="button button--primary" href={claimPath(current, locale)!}>{c.short}</Link>
    </aside>}
  </div>;
}
