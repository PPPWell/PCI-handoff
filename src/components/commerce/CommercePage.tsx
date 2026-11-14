import {redirect} from "next/navigation";
import {claimPath} from "@/lib/coupons/offer";
import Link from "next/link";
import type { Catalog,RouteEntry,RouteRegistry } from "@/lib/catalog/types";
import { money } from "@/lib/catalog/select";
import { pathFor } from "@/lib/catalog/routes";
import { commerceCopy } from "@/lib/commerce/copy";
import { contentCopy } from "@/lib/catalog/copy";
import { Breadcrumbs,Section,SubscriptionCallout } from "@/components/content/ContentShared";
import { CheckoutForm } from "./CheckoutForm";

export function CommercePage({route,catalog,registry}:{route:RouteEntry;catalog:Catalog;registry:RouteRegistry}) {
  const locale=route.locale,c=commerceCopy[locale],page=route.commercePage!;
  const offer=page==="checkout"?catalog.offers.find(offer=>offer.id===route.entityId):undefined;
  if(offer?.benefit)redirect(claimPath(offer,locale)!);
  const place=offer?catalog.places.find(place=>place.id===offer.placeId):undefined;
  return <main id="main-content" className={`content-page container commerce-page ${page==="checkout"?"commerce-page--checkout":""}`} tabIndex={-1}>
    <Breadcrumbs wide locale={locale} items={[{text:locale==="zh"?"首页":locale==="it"?"Home":"Home",href:`/${locale}/`},...(place?[{text:place.translations[locale].name,href:pathFor(registry,`place:${place.id}`,locale)}]:[]),{text:c.titles[page]}]} />
    <header className="page-introduction"><p className="eyebrow" lang="it">Palazzo Italia-Cina</p><h1>{c.titles[page]}</h1><p id="purchase-closed" className="preview-notice">{page==="success-preview"?c.sample:c.closed}</p></header>
    {page==="checkout"&&offer&&place&&<div className="checkout-layout"><div className="checkout-details"><section className="content-section" aria-labelledby="order-summary"><p className="eyebrow">{c.offer}</p><h2 id="order-summary">{offer.translations[locale].name}</h2><p>{place.translations[locale].name} · {offer.people??"[N]"} {c.people}</p><p>{offer.translations[locale].summary}</p><p className="price">{money(offer.priceCents,locale)} <span className="small-copy">/ {c.perVoucher}</span></p><Link className="text-link" href={pathFor(registry,`place:${place.id}`,locale)!}>{c.back}</Link></section>
      <Section id="before-purchase" title={c.before}><dl className="purchase-facts">{[[c.seller,c.sellerValue],[c.validity,c.legalPending],[c.refund,c.legalPending],[c.support,c.supportValue]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{offer.translations[locale].conditions}</p><Link className="text-link" href={`/${locale}/support/`}>{c.help}</Link></Section></div><CheckoutForm locale={locale} offer={offer} /></div>}
    {page==="result"&&<section className="state-panel" aria-labelledby="unverified-order"><h2 id="unverified-order">{c.unknownTitle}</h2><p>{c.unknown}</p><div className="state-actions"><Link className="button button--secondary" href={`/${locale}/email-help/`}>{c.emailHelp}</Link><Link className="text-link" href={`/${locale}/support/`}>{c.help}</Link></div></section>}
    {page==="email-help"&&<><Section id="email-recovery" title={c.emailHelp}><ol className="purchase-steps">{c.steps.map(step=><li key={step}>{step}</li>)}</ol><div className="state-actions">{[c.openVoucher,c.resend].map(label=><button key={label} type="button" disabled className="button button--secondary" aria-describedby="recovery-unavailable">{label}</button>)}<Link className="button button--secondary" href={`/${locale}/account/`}>{c.account}</Link></div><p id="recovery-unavailable" className="small-copy">{c.unavailable}</p></Section><Link className="text-link" href={`/${locale}/support/`}>{c.help}</Link></>}
    {page==="success-preview"&&<><section className="purchase-receipt content-section" aria-labelledby="sample-voucher"><span className="badge">{c.sample}</span><h2 id="sample-voucher">[N] × [{locale==="zh"?"套餐名称":locale==="it"?"Nome del menù":"Menu name"}]</h2><p>{c.sent}</p><p>{c.expiry}</p><div className="state-actions"><button type="button" disabled className="button button--primary">{c.openVoucher}</button><button type="button" disabled className="button button--secondary">{c.share}</button></div><p className="small-copy">{c.later}</p></section>
      <Section id="purchase-next" title={c.next}><ol className="purchase-steps">{c.nextSteps.map(step=><li key={step}>{step}</li>)}</ol><Link className="text-link" href={`/${locale}/email-help/`}>{c.emailHelp}</Link></Section>
      <section className="content-section" aria-labelledby="purchase-referral"><h2 id="purchase-referral">{c.referral}</h2><fieldset className="purchase-sources" aria-describedby="referral-local"><legend className="sr-only">{c.referral}</legend>{c.sources.map((source,index)=><label className="source-choice" key={source}><input type="radio" name="example-referral" value={index} /><span>{source}</span></label>)}</fieldset><p id="referral-local" className="small-copy">{c.localOnly}</p></section><SubscriptionCallout locale={locale} registry={registry} /></>}
    <nav className="info-related" aria-label={contentCopy[locale].back}><Link className="text-link" href={`/${locale}/help/`}>{c.help}</Link>{process.env.CONTENT_MODE!=="published"&&<><Link className="text-link" href={`/${locale}/preview/purchase-success/`}>{c.previewLink}</Link><Link className="text-link" href={`/${locale}/preview/states/#states-1`}>{c.states}</Link></>}</nav>
  </main>;
}
