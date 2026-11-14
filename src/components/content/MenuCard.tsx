import type { Offer } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { claimCopy, mealWindowLabel } from "@/lib/coupons/ux";
import { menuItems } from "@/lib/catalog/menu";
import { Photograph } from "./ContentShared";

export const pendingPhoto = { zh: "套餐图片待补充", it: "Foto del menù in arrivo", en: "Menu photo coming soon" } as const;

/** One menu of a coupon offer: photo (or a placeholder), the restaurant's own section name, meal window and a dish list, Italian first with the page language beside or below it. */
export function MenuCard({ offer, locale }: { offer: Offer; locale: Locale }) {
  const course = offer.translations[locale].courses[0], items = menuItems(course.description), italianItems = menuItems(offer.translations.it.courses[0].description);
  return <article className="deluxe-menu card">
    <div className="deluxe-menu__head">
      <div className="deluxe-menu__photo"><Photograph photos={offer.photos ?? []} locale={locale} fallback={pendingPhoto[locale]} monogram="P" caption={false} carousel coverFirst /></div>
      <div className="deluxe-menu__title">
        {/* offer.menuSection (the restaurant's own section name) is not shown until it is confirmed against the printed menu */}
        <h3>{course.name}</h3>
        {offer.mealWindows?.length && <p className="deluxe-menu__window"><strong>{claimCopy[locale].window}</strong> {mealWindowLabel(offer.mealWindows, locale)}</p>}
      </div>
    </div>
    <ul className="menu-items">{items.map((item, index) => <li key={index}>
      <span className="menu-items__it" lang="it">{italianItems[index] ?? item}</span>
      {locale !== "it" && <span className="menu-items__gloss">{item}</span>}
    </li>)}</ul>
  </article>;
}
