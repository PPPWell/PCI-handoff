import type { Offer } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { htmlLanguages } from "@/lib/i18n";
import { orderPhrases, placeUx } from "@/lib/catalog/place-ux";
import { CopyButton } from "./CopyButton";

/** Dish cards: Italian name first, then the page language; unknown allergens are never guessed. */
export function DishCards({ offer, locale }: { offer: Offer; locale: Locale }) {
  const u = placeUx[locale];
  if (!offer.dishes?.length) return null;
  return <>
    <div className="dish-grid">{offer.dishes.map((dish) => {
      const it = dish.translations.it, here = dish.translations[locale];
      return <article className="dish-card" key={dish.id}>
        <h3 lang="it">{it.name}</h3>
        {locale !== "it" && <p className="dish-card__local">{here.name}</p>}
        <p className="small-copy">{here.taste}</p>
        {dish.vegetarian && <p className="caption">{u.vegetarian}</p>}
        {dish.allergens && dish.allergens.length > 0 && <p className="caption">{dish.allergens.join(" · ")}</p>}
      </article>;
    })}</div>
  </>;
}

export function OrderCheatSheet({ locale }: { locale: Locale }) {
  const u = placeUx[locale];
  return <div className="cheat-sheet">
    <p className="small-copy">{u.cheatLead}</p>
    <ul>{orderPhrases.map((phrase) => <li key={phrase.it}>
      <p lang={htmlLanguages.it} className="cheat-sheet__it">{phrase.it}</p>
      {locale !== "it" && <p className="small-copy">{phrase.gloss[locale]}</p>}
      <CopyButton text={phrase.it} label={u.copyPhrase} done={u.copied} className="button button--secondary cheat-sheet__copy" />
    </li>)}</ul>
  </div>;
}
