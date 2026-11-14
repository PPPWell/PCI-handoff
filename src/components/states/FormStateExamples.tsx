import type { Locale } from "@/lib/i18n";
import { formPreviewCopy, verificationErrorPreviews } from "@/lib/states/form-copy";
export function FormStateExamples({ locale }: { locale: Locale }) {
  const c=formPreviewCopy[locale];
  return <><article className="state-card" data-preview-state="required-consent"><h3>{c.required}</h3><label className="checkbox-row" htmlFor="example-consent"><input id="example-consent" type="checkbox" disabled aria-invalid="true" aria-describedby="example-consent-error" />{c.consent}</label><p className="field-error" id="example-consent-error">{c.required}</p><button type="button" disabled className="button button--primary">{c.continue}</button></article>
    {verificationErrorPreviews(locale).map((state)=><article className="state-card" key={state.id} data-preview-state={state.id}><h3>{state.title}</h3><label className="field" htmlFor={`example-${state.id}`}>{c.code}<input id={`example-${state.id}`} type="text" inputMode="numeric" autoComplete="off" disabled aria-invalid="true" aria-describedby={`error-${state.id}`} /></label><p className="field-error" id={`error-${state.id}`}>{state.message}</p><button type="button" disabled className="button button--secondary">{state.expired ? c.resend : c.verify}</button></article>)}</>;
}
