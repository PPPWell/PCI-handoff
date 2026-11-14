"use client";
import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { Offer,Place,RouteRegistry } from "@/lib/catalog/types";
import { pathFor } from "@/lib/catalog/routes";
import { voucherPreview,type voucherPreviewIds } from "@/lib/states/copy";
import { experienceCopy } from "@/lib/vouchers/experience-copy";
import { ReservationComposer } from "./ReservationComposer";
import { directReservationLinks } from "@/lib/vouchers/reservation";

export function VoucherPreview({locale,offer,place,registry,initialState="within-14-days"}:{locale:Locale;offer:Offer;place:Place;registry:RouteRegistry;initialState?:typeof voucherPreviewIds[number]}) {
  const c=experienceCopy[locale],[state,setState]=useState(initialState),states=voucherPreview(locale),selected=states.find(item=>item.id===state)!;
  const to=(page:string)=>pathFor(registry,`experience:${page}`,locale)!;
  const active=selected.showCode;
  const contacts=directReservationLinks(place.facts.reservations),coordinates=place.facts.coordinates;
  return <div className="voucher-experience"><label className="field voucher-state-choice" htmlFor="voucher-state">{c.state}<select id="voucher-state" value={state} onChange={event=>setState(event.target.value as typeof state)}>{states.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <section className="voucher-ticket" aria-labelledby="voucher-status"><span className="badge" id="voucher-status">{selected.title}</span><p>{selected.description}</p><p className="caption">{c.expiry}</p>
      {active&&<><div className="qr-illustration" data-code-illustration="true"><p>{c.qr}</p><strong>{c.code}</strong></div><p>{c.scan}</p>{locale==="zh"&&<p className="small-copy" lang="it">Lo staff inquadra il QR con il telefono del ristorante.</p>}<div className="state-actions"><Link className="button button--primary" href={to("qr")}>{c.fullscreen}</Link><Link className="button button--secondary" href={to("staff")}>{c.staff}</Link></div><button type="button" disabled className="text-link">{c.pin}</button><button type="button" disabled className="text-link">{c.staffLogin}</button></>}
      <h2>{offer.translations[locale].name}</h2>{locale!=="it"&&<p lang="it">{offer.translations.it.name}</p>}<p>{offer.people??"[N]"} {c.people} · {place.translations[locale].name}</p><p>{c.order}</p>{active&&<Link className="text-link" href={to("share")}>{c.share}</Link>}
    </section>
    <nav className="policy-navigation" aria-label={c.voucher}><a className="text-link" href="#voucher-menu">{c.details}</a>{active&&<a className="text-link" href="#voucher-booking">{c.booking}</a>}<a className="text-link" href="#voucher-directions">{c.directions}</a>{active&&<a className="text-link" href="#voucher-manage">{c.manage}</a>}</nav>
    <section id="voucher-menu" className="content-section" aria-labelledby="voucher-menu-title"><h2 id="voucher-menu-title">{c.details}</h2>{offer.translations[locale].courses.map((course,index)=><div className="voucher-course" key={index}><h3>{course.name}</h3><p>{course.description}</p>{locale!=="it"&&<p lang="it">{offer.translations.it.courses[index]?.name} · {offer.translations.it.courses[index]?.description}</p>}</div>)}<p className="small-copy">{offer.translations[locale].allergens}</p><Link className="text-link" href={pathFor(registry,`place:${place.id}`,locale)!}>{place.translations[locale].name}</Link></section>
    {active&&<><section className="content-section" aria-labelledby="voucher-offline"><h2 id="voucher-offline">{c.offline}</h2><p>{c.offlineNote}</p><div className="state-actions">{[c.save,c.apple,c.google].map(label=><button key={label} type="button" disabled className="button button--secondary">{label}</button>)}</div></section>
      <div id="voucher-booking">{locale==="it"?<section className="content-section"><h2>{c.booking}</h2><p>{c.bookDirect}</p><div className="state-actions">{contacts.phone&&<a className="button button--secondary" href={contacts.phone}>{c.phone}</a>}{contacts.whatsapp&&<a className="button button--secondary" href={contacts.whatsapp} rel="noreferrer">{c.whatsapp}</a>}{contacts.email&&<a className="text-link" href={contacts.email}>{c.email}</a>}</div>{Object.keys(contacts).length===0&&<p className="small-copy">{c.channelsMissing}</p>}<p className="small-copy">{place.facts.reservations.walkIn}</p></section>:<><ReservationComposer locale={locale} menu={offer.translations.it.name} channels={{whatsapp:place.facts.reservations.whatsapp,email:place.facts.reservations.email}} /><nav className="state-actions" aria-label={c.booking}><Link className="text-link" href={to("hotel")}>{c.titles.hotel}</Link><Link className="text-link" href={to("replies")}>{c.titles.replies}</Link></nav></>}</div></>}
    <section id="voucher-directions" className="content-section"><h2>{c.directions}</h2><p>{place.facts.address.includes("[")?c.address:place.facts.address} · {place.facts.openingHours.includes("[")?c.hours:place.facts.openingHours}</p>{coordinates?<a className="button button--secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}`} rel="noreferrer">{c.map}</a>:<button type="button" disabled className="button button--secondary">{c.map}</button>}</section>
    {active&&<section id="voucher-manage" className="content-section"><h2>{c.manage}</h2><p>{c.ownerOnly}</p>{state!=="extended"&&<Link className="button button--secondary" href={to("refund")}>{state==="within-14-days"?c.refund:c.extend}</Link>}<p className="caption">{c.manageClosed}</p></section>}
    <Link className="text-link" href={`/${locale}/support/`}>{c.support}</Link>
  </div>;
}
