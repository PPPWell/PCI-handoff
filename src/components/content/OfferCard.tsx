import Link from "next/link";
import type { Offer } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { NoImage } from "@/components/ui/primitives";
import { Photograph } from "@/components/content/ContentShared";
import { menuItems } from "@/lib/catalog/menu";
import { claimPath, offerValue } from "@/lib/coupons/offer";
import { couponPricing } from "@/lib/coupons/ux";

/**
 * One menu's coupon: dish photo on the left; on the right the red saving, the price to pay with the list price struck
 * through, three dishes (tap for the whole menu) and the claim button. Shared by the home page and the restaurant page.
 */
export function OfferCard({ offer, locale, label, fallback, href }: { offer: Offer; locale: Locale; label: string; fallback: string; href?: string }) {
  const course = offer.translations[locale].courses[0], pricing = couponPricing(offer, locale), items = menuItems(course.description);
  const target = href ?? claimPath(offer, locale);
  const action = <>{label}<Icon name="arrow" /></>;
  return <div className="offer-card">
    {offer.photos?.length ? <Photograph photos={offer.photos} locale={locale} fallback={fallback} monogram="P" caption={false} carousel coverFirst /> : <NoImage label={fallback} monogram={locale === "zh" ? "餐" : "R"} />}
    <div className="offer-card__body">
      <h3>{course.name}</h3>
      <strong className="offer-discount">{offerValue(offer, locale)}</strong>
      {pricing && <p className="offer-price"><span className="offer-price__pay">{pricing.coupon}</span><s className="offer-price__list">{pricing.menu}</s></p>}
    </div>
    {items.length > 0 && <details className="offer-dishes">
      <summary><span>{items.slice(0, 3).join(" · ")}</span><Icon name="chevron" /></summary>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </details>}
    {target && <Link className="button button--primary offer-card__cta" href={target} aria-label={`${label} · ${course.name}`}>{action}</Link>}
  </div>;
}
