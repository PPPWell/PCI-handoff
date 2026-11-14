"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Offer } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { contentCopy } from "@/lib/catalog/copy";
import {claimPath,discountLabels,offerValue} from "@/lib/coupons/offer";
import {mealWindowLabel} from "@/lib/coupons/ux";
import { OfferCard } from "@/components/content/OfferCard";
import { pendingPhoto } from "@/components/content/MenuCard";
import { money } from "@/lib/catalog/select";
import { commerceCopy } from "@/lib/commerce/copy";

export function OfferPanel({ offer, locale }: { offer: Offer; locale: Locale }) {
  const c = contentCopy[locale], copy = offer.translations[locale], card = useRef<HTMLDivElement>(null), [fixed, setFixed] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setFixed(!entry.isIntersecting && entry.boundingClientRect.bottom < 0));
    if (card.current) observer.observe(card.current); return () => observer.disconnect();
  }, []);
  const state = offer.status === "paused" ? c.paused : c.soon;
  return <>
    <div id="price-card" ref={card} className="price-panel"><p className="eyebrow">{c.exclusive}</p><h2>{copy.name}</h2><p>{copy.summary}</p><p className="small-copy">{offer.people ?? "[N]"} {c.people}</p>
      <strong className="price">{money(offer.priceCents, locale)}</strong><p className="small-copy">{c.aLaCarte} {money(offer.aLaCarteCents, locale)}</p>
      <button className="button button--primary" disabled>{state}</button><p className="small-copy">{c.rules}</p><Link className="text-link" href={`/${locale}/checkout/${offer.id}/`}>{commerceCopy[locale].checkoutLink}</Link><Link className="text-link" href={`/${locale}/subscribe/`}>{c.notify}</Link>
    </div>
    {fixed && <aside className="purchase-bar" aria-label={c.exclusive}><span><strong>{money(offer.priceCents, locale)}</strong><span className="caption">{copy.name}</span></span><button className="button button--primary" disabled>{state}</button></aside>}
  </>;
}

const optionsCopy = {
  zh: { title: "免费领取优惠券", note: "豪华套餐 1 和 2 各有一张专属优惠券，按需领取。" },
  it: { title: "Richiedi il coupon gratuito", note: "Un coupon per ciascun Menù Deluxe: scegli quello che ti serve." },
  en: { title: "Claim a free coupon", note: "There is one coupon for each Deluxe menu. Take the one you need." },
} as const;

/** One free coupon per menu of the restaurant, each with its own meal window and claim button. */
export function CouponOfferPanel({ offers, locale }: { offers: Offer[]; locale: Locale }) {
  const c = contentCopy[locale], labels = discountLabels[locale], t = optionsCopy[locale], card = useRef<HTMLDivElement>(null), [fixed, setFixed] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setFixed(!entry.isIntersecting && entry.boundingClientRect.bottom < 0));
    if (card.current) observer.observe(card.current); return () => observer.disconnect();
  }, []);
  const first = offers[0], menuName = (offer: Offer) => offer.translations[locale].courses[0].name;
  return <>
    <div id="price-card" ref={card} className="price-panel coupon-options">
      <h2>{t.title}</h2>
      {offers.length > 1 && <p className="small-copy">{t.note}</p>}
      {first?.mealWindows?.length ? <p className="small-copy coupon-hours">{mealWindowLabel(first.mealWindows, locale)}</p> : null}
      <ul className="coupon-option-list">{offers.map((offer) => <li className="coupon-option" key={offer.id}>
        {offer.status === "paused" ? <button className="button button--primary" disabled>{c.paused}</button> : <OfferCard offer={offer} locale={locale} label={labels.claim} fallback={pendingPhoto[locale]} />}
      </li>)}</ul>
      <p className="small-copy">{labels.pay}</p>
    </div>
    {fixed && <aside className="purchase-bar" aria-label={c.exclusive}><span><strong>{offerValue(first, locale)}</strong><span className="caption">{offers.map(menuName).join(" · ")}</span></span><Link className="button button--primary" href={offers.length === 1 ? claimPath(first, locale)! : "#price-card"}>{labels.claim}</Link></aside>}
  </>;
}
