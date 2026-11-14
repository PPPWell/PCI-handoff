"use client";
import Link from "next/link";
import { useState } from "react";
import type { Offer } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { commerceCopy } from "@/lib/commerce/copy";
import { paymentMethods } from "@/lib/commerce/routes";
import { calculateOrderAmounts } from "@/lib/commerce/money";
import { money } from "@/lib/catalog/select";

/** Pre-launch form: quantity is local, personal-data controls and submission stay closed. */
export function CheckoutForm({offer,locale}:{offer:Offer;locale:Locale}) {
  const c=commerceCopy[locale],[quantity,setQuantity]=useState(1);
  const total=offer.priceCents===null?null:calculateOrderAmounts({unitAmountCents:offer.priceCents,quantity,commissionBps:0,commissionVatBps:0,merchantVatBps:null,trial:false}).totalAmountCents;
  return <div className="checkout-form">
    <section className="content-section" aria-labelledby="checkout-quantity"><h2 id="checkout-quantity">{c.quantity}</h2>
      <div className="quantity-control" role="group" aria-label={c.quantity} aria-describedby="quantity-limit"><button type="button" className="icon-button" aria-label={c.minus} disabled={quantity===1} onClick={()=>setQuantity(value=>Math.max(1,value-1))}>−</button><output aria-live="polite" aria-label={c.quantity}>{quantity}</output><button type="button" className="icon-button" aria-label={c.plus} disabled={quantity===6} onClick={()=>setQuantity(value=>Math.min(6,value+1))}>+</button></div><p id="quantity-limit" className="small-copy">{c.limit}</p>
      <label className="field" htmlFor="purchase-email">{c.email}<input id="purchase-email" type="email" disabled autoComplete="off" aria-describedby="purchase-email-hint" /></label><p id="purchase-email-hint" className="small-copy">{c.emailHint}</p>
    </section>
    <section className="content-section" aria-labelledby="checkout-consent"><h2 id="checkout-consent">{c.consent}</h2>
      <fieldset className="checkout-consents" disabled aria-describedby="purchase-closed"><legend className="sr-only">{c.consent}</legend>{[c.terms,c.immediate,c.marketing].map((label,index)=><label className="checkbox-row" key={index}><input type="checkbox" required={index<2} /><span>{label}</span></label>)}</fieldset>
      <Link className="text-link" href={`/${locale}/legal/`}>{c.rules}</Link><p className="small-copy">{c.legalNote}</p>
    </section>
    <section className="checkout-totals" aria-label={c.total}><dl><div><dt>{c.subtotal} × {quantity}</dt><dd>{money(total,locale)}</dd></div><div><dt>{c.vat}</dt><dd>{c.vatPlaceholder}</dd></div><div className="checkout-total"><dt>{c.total}</dt><dd>{money(total,locale)}</dd></div></dl><button className="button button--primary" type="button" disabled aria-describedby="purchase-closed">{c.soon}</button>
      <p className="small-copy">{c.payments}: {paymentMethods(locale).map(id=>c.methods[id as keyof typeof c.methods]).join(" · ")}</p><p className="caption">{locale==="zh"?c.paymentNote:c.paymentNoteOther}</p>
    </section>
    <aside className="purchase-bar" aria-label={c.total}><span><strong>{money(total,locale)}</strong><span className="caption">{c.total}</span></span><button className="button button--primary" type="button" disabled>{c.soon}</button></aside>
  </div>;
}
