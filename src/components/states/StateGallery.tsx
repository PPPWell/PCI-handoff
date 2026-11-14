import { FormStateExamples } from "./FormStateExamples";
import { formPreviewCopy } from "@/lib/states/form-copy";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { stateCopy, voucherPreview, purchasePreview } from "@/lib/states/copy";
import { LoadingState } from "./LoadingState";
import { StatePanel } from "./StatePanel";

export function StateGallery({ locale }: { locale: Locale }) {
  const c=stateCopy[locale], f=formPreviewCopy[locale];
  return <main id="main-content" className="content-page container state-gallery" tabIndex={-1}>
    <header className="page-introduction"><p className="eyebrow" lang="it">Palazzo Italia-Cina</p><h1>{c.previewTitle}</h1><p className="preview-notice">{c.previewNote}</p></header>
    <nav className="policy-navigation" aria-label={c.previewTitle}>{[c.generic,c.purchase,c.voucher,c.offline].map((title,index)=><a className="text-link" key={title} href={`#states-${index}`}>{title}</a>)}</nav>
    <section className="content-section" id="states-0"><h2>{c.generic}</h2><div className="state-grid"><LoadingState locale={locale} fullPage={false} />{(["error","missing","maintenance","empty"] as const).map((variant)=><StatePanel key={variant} locale={locale} variant={variant} fullPage={false} />)}<article className="state-card"><h3>{c.submitting}</h3><button type="button" disabled aria-busy="true" className="button button--primary">{c.submitting}</button></article><article className="state-card" data-preview-state="network-error"><h3>{f.networkTitle}</h3><p>{c.networkError}</p><button type="button" disabled className="button button--secondary">{c.retry}</button></article></div></section>
    <section className="content-section" id="states-1"><h2>{c.purchase}</h2><div className="state-grid">{purchasePreview(locale).map((state)=><article className="state-card" key={state.id} data-preview-state={state.id}><span className="badge">{c.sample}</span><h3>{state.title}</h3><p>{state.description}</p><button type="button" className="button button--secondary" disabled>{state.title}</button></article>)}</div></section>
    <section className="content-section" id="states-2"><h2>{c.voucher}</h2><div className="state-grid">{voucherPreview(locale).map((state)=><article className="state-card" key={state.id} data-preview-state={state.id}><span className="badge">{c.sample}</span><h3>{state.title}</h3><p>{state.description}</p>{state.showCode && <div className="qr-illustration"><p>{c.qr}</p><span>{c.code}</span></div>}{state.legal && <p className="caption">{c.legalNotice}</p>}</article>)}</div></section>
    <section className="content-section" id="states-3"><h2>{c.offline}</h2><div className="state-grid"><article className="state-card"><h3>{c.offlineTitle}</h3><p>{c.saved}</p><p>{c.offlineDetail}</p></article><article className="state-card"><h3>{f.reconnected}</h3><p>{f.reconnectedDetail}</p></article><article className="state-card"><h3>{c.formError}</h3><label className="field" htmlFor="example-email">{c.emailLabel}<input id="example-email" type="email" defaultValue="invalid-example" aria-invalid="true" aria-describedby="example-email-error" /></label><p id="example-email-error" className="field-error">{c.formError}</p></article><FormStateExamples locale={locale} /></div></section>
    <Link className="text-link" href={`/${locale}/`}>{c.home}</Link>
  </main>;
}
