'use client';
import { InstallCard } from '@/components/site/InstallApp';
import { showDialog, closeDialog } from "@/lib/dialog";
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Offer } from '@/lib/catalog/types';
import type { Locale } from '@/lib/i18n';
import type { OwnedCoupon } from '@/lib/coupons/types';
import { couponCopy } from '@/lib/coupons/copy';
import { menuItems } from '@/lib/catalog/menu';
import { bookingCopy, claimCopy, couponPricing, daysLeftLabel, discountLabel, formatDay, mealWindowLabel, spacedCode } from '@/lib/coupons/ux';
import { claimRequestId, clearClaimRequest, parseClaimResult, claimRequestAfterFailure } from '@/lib/coupons/browser';
import { EmailSignIn } from '@/components/account/EmailSignIn';
import { QuickSubscribe } from '@/components/coupons/QuickSubscribe';
import { Icon } from '@/components/ui/Icon';
import { track, currentChannel } from '@/lib/analytics';

/** A coupon this person already holds for the campaign: the claim page shows it instead of a second "claim" button. */
export type HeldCoupon = { path: string; expiresOn: string; daysLeft: number; shortCode: string | null };
/** Another menu of the same restaurant, offered after a claim. */
export type OtherMenu = { id: string; name: string; value: string; href: string };

const more = {
  zh: { menu: '查看套餐内容', notes: '领取须知', heldTitle: '你已领取这张券', heldBody: '券在个人中心里，到店点这个套餐时出示给店员。用完后还可以再领一张（每个套餐每个账户最多领取两张）。', view: '查看这张券', directions: '导航到店', other: '这家店的另一个套餐也可以免费领', retry: '网络不稳定，再点一次即可，不会重复领取。', reuse: '每次到店用一张，每个账户每个套餐最多领取两张' },
  it: { menu: 'Cosa include il menù', notes: 'Prima di richiedere', heldTitle: 'Hai già questo coupon', heldBody: 'È nel tuo account: mostralo allo staff quando ordini questo menù. Dopo l’uso puoi richiederne un altro (al massimo due per menù e per account).', view: 'Apri il coupon', directions: 'Indicazioni', other: 'Puoi richiedere gratis anche l’altro menù', retry: 'Connessione instabile: tocca di nuovo, il coupon non verrà duplicato.', reuse: 'Un coupon per visita, al massimo due per menù e per account' },
  en: { menu: 'What the menu includes', notes: 'Before you claim', heldTitle: 'You already have this coupon', heldBody: 'It is in your account. Show it to staff when you order this menu. Once used, you can get one more (at most two per menu and account).', view: 'Open the coupon', directions: 'Directions', other: 'The other menu here is free to claim too', retry: 'Unstable connection. Tap again; you will not get a duplicate coupon.', reuse: 'One coupon per visit; at most two per menu and account' },
} as const;

/** "View this coupon" opens the coupon over the claim page: QR, short code and validity, no page change. */
function CouponSheet({ path, label, close, codeLabel, value, name, place, code, validUntil }: { path: string; label: string; close: string; codeLabel: string; value: string; name: string; place: string; code?: string | null; validUntil: string }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  function show() { setOpen(true); window.setTimeout(() => showDialog(sheet.current), 0); }
  return <>
    <button type="button" className="button button--primary coupon-actions__main" onClick={show}>{label}</button>
    <dialog ref={sheet} className="claim-dialog coupon-sheet" aria-labelledby="coupon-sheet-title" onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) closeDialog(sheet.current); }}>
      <div className="claim-dialog__body coupon-sheet__body">
        <button type="button" className="claim-dialog__close" onClick={() => closeDialog(sheet.current)} aria-label={close}><Icon name="close" /></button>
        <strong className="coupon-ticket__value">{value}</strong>
        <h2 id="coupon-sheet-title" className="coupon-ticket__name">{name}</h2>
        <p className="coupon-ticket__place" lang="it">{place}</p>
        {/* The token is in the image URL: never send it on as a referrer. */}
        {open && <Image className="coupon-sheet__qr" src={`${path}qr.png/`} alt="QR" width={240} height={240} referrerPolicy="no-referrer" unoptimized />}
        {code && <p className="coupon-ticket__code"><span>{codeLabel}</span> <strong>{spacedCode(code)}</strong></p>}
        <p className="small-copy">{validUntil}</p>
      </div>
    </dialog>
  </>;
}

/**
 * Claim page body, a short confirmation step: photo, price and window once, one red button, the menu and terms folded away.
 * Signed-out visitors get the email-code step in a sheet; after verification the page reloads with ?go=1 and claims once.
 * Someone who already holds the coupon sees it instead of the button (the server would return the same coupon anyway).
 */
export function CouponClaimForm({ offer, locale, restaurant = '', signedIn = true, authEnabled = true, autoClaim = false, held = null, others = [], directions = null, booking = null }: { offer: Offer; locale: Locale; restaurant?: string; signedIn?: boolean; authEnabled?: boolean; autoClaim?: boolean; held?: HeldCoupon | null; others?: OtherMenu[]; directions?: string | null; booking?: string | null }) {
  const c = couponCopy[locale];
  const t = claimCopy[locale];
  const m = more[locale];
  const copy = offer.translations[locale];
  const course = copy.courses[0];
  const pricing = couponPricing(offer, locale);
  const benefit = offer.benefit!;
  const photo = offer.photos?.[0] ?? null;
  const items = course ? menuItems(course.description) : [], italianItems = offer.translations.it.courses[0] ? menuItems(offer.translations.it.courses[0].description) : [];
  const request = useRef<string | null>(null);
  const busy = useRef(false);
  const started = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OwnedCoupon | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const returnTo = `/${locale}/claim/${benefit.campaignId}/?go=1`;

  function openLogin() {
    setLoginOpen(true);
    window.setTimeout(() => showDialog(dialog.current), 0);
  }
  function closeLogin() {
    closeDialog(dialog.current);
    setLoginOpen(false);
  }

  async function claim() {
    if (busy.current) return;
    track('claim_started', { campaign: offer.benefit?.campaignId ?? '', signed_in: signedIn });
    if (!signedIn) { openLogin(); return; }
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const id = request.current ?? claimRequestId(benefit.campaignId);
      request.current = id;
      const response = await fetch('/api/coupons/actions/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'claim', requestId: id, campaignId: benefit.campaignId, locale, ...(currentChannel() ? { channel: currentChannel() } : {}) }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      const raw = await response.json();
      if (!response.ok || raw?.ok !== true) {
        const code = typeof raw?.code === 'string' && Object.hasOwn(c.errors, raw.code) ? raw.code : 'unavailable';
        setError(code);
        request.current = claimRequestAfterFailure(benefit.campaignId, id, code);
        if (code === 'sign_in_required') openLogin();
        return;
      }
      const value = parseClaimResult(raw, benefit.campaignId);
      setResult(value);
      clearClaimRequest(benefit.campaignId, id);
      request.current = null;
    } catch {
      setError('unavailable');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  // After the email step the page reloads with ?go=1: claim once, then drop the marker.
  useEffect(() => {
    if (!autoClaim || !signedIn || started.current) return;
    started.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    if (held) return;
    // Next frame, not inside the effect; not cancelled, because `started` already blocks a second run.
    requestAnimationFrame(() => { void claim(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const otherMenus = others.length > 0 && (
    <div className="claim-other">
      <p>{m.other}</p>
      {others.map((o) => <Link key={o.id} className="button button--secondary" href={o.href}>{o.name} · {o.value}<Icon name="arrow" /></Link>)}
    </div>
  );

  if (result) {
    const coupon = result.coupon;
    return (
      <section className="claim-success" aria-labelledby="coupon-claimed">
        <h2 id="coupon-claimed">{coupon.status === 'unused' ? t.successTitle : c.status[coupon.status]}</h2>
        <p>{t.successBody}</p>
        <div className="coupon-ticket" aria-label={copy.name}>
          <strong className="coupon-ticket__value">{discountLabel(coupon.discountCents, locale)}</strong>
          <p className="coupon-ticket__name">{course?.name ?? copy.name}</p>
          <p className="coupon-ticket__place" lang="it">{restaurant}</p>
          {coupon.shortCode && <p className="coupon-ticket__code"><span>{t.codeLabel}</span> <strong>{spacedCode(coupon.shortCode)}</strong></p>}
          <p className="small-copy">{t.validUntil} {formatDay(coupon.expiresOn, locale)}</p>
        </div>
        <div className="coupon-actions">
          {result.path && <CouponSheet path={result.path} label={t.openCoupon} close={t.dialogClose} codeLabel={t.codeLabel} value={discountLabel(coupon.discountCents, locale)} name={course?.name ?? copy.name} place={restaurant} code={coupon.shortCode} validUntil={`${t.validUntil} ${formatDay(coupon.expiresOn, locale)}`} />}
          {booking && <a className="button button--secondary" href={booking} rel="noopener noreferrer" data-track="booking_clicked" data-track-item="coupon">{bookingCopy[locale].label}</a>}
          {directions && <a className="button button--secondary" href={directions} rel="noopener noreferrer" data-track="directions_clicked" data-track-item="coupon">{m.directions}<Icon name="pin" /></a>}
        </div>
        {booking && offer.mealWindows?.length ? <p className="small-copy">{bookingCopy[locale].note(mealWindowLabel(offer.mealWindows, locale))}</p> : null}
        {otherMenus}
        <InstallCard locale={locale} />
        <div className="claim-subscribe"><QuickSubscribe locale={locale} /></div>
      </section>
    );
  }

  if (held) {
    return (
      <section className="claim-success claim-held" aria-labelledby="coupon-held">
        <p className="coupon-ticket__status"><span className="badge">{c.status.unused}</span><span className={`days-left${held.daysLeft <= 7 ? ' days-left--soon' : ''}`}>{daysLeftLabel(held.daysLeft, locale)}</span></p>
        <h2 id="coupon-held">{m.heldTitle}</h2>
        <p>{m.heldBody}</p>
        <div className="coupon-actions">
          <CouponSheet path={held.path} label={m.view} close={t.dialogClose} codeLabel={t.codeLabel} value={discountLabel(benefit.discountCents, locale)} name={course?.name ?? copy.name} place={restaurant} code={held.shortCode} validUntil={`${t.validUntil} ${formatDay(held.expiresOn, locale)}`} />
          {booking && <a className="button button--secondary" href={booking} rel="noopener noreferrer" data-track="booking_clicked" data-track-item="coupon">{bookingCopy[locale].label}</a>}
        </div>
        {booking && offer.mealWindows?.length ? <p className="small-copy">{bookingCopy[locale].note(mealWindowLabel(offer.mealWindows, locale))}</p> : null}
        {otherMenus}
      </section>
    );
  }

  return (
    <section className="claim-offer" aria-label={copy.name}>
      <div className="claim-summary">
        {photo && <div className="claim-summary__photo"><Image src={photo.url} alt={photo.alt[locale]} fill sizes="(min-width: 640px) 12rem, 40vw" priority /></div>}
        <div className="claim-summary__text">
          <strong className="offer-discount">{discountLabel(benefit.discountCents, locale)}</strong>
          {pricing && <p className="offer-price"><span className="offer-price__pay">{pricing.coupon}</span><s className="offer-price__list">{pricing.menu}</s></p>}
          {offer.mealWindows?.length ? <p className="small-copy">{mealWindowLabel(offer.mealWindows, locale)}</p> : null}
        </div>
      </div>
      <button type="button" className="button button--primary claim-offer__cta" disabled={pending} onClick={claim}>{pending ? t.claiming : t.claim}</button>
      <div className="claim-offer__feedback" aria-live="polite">
        {error && <p role="alert">{error === 'unavailable' ? m.retry : c.errors[error as keyof typeof c.errors]}</p>}
      </div>
      <ul className="claim-facts">
        <li>{t.free} · {t.payAtRestaurant}</li>
        <li>{t.validity({ days: offer.validityDays, months: offer.validityMonths })}</li>
        <li>{m.reuse}</li>
      </ul>
      {items.length > 0 && (
        <details className="claim-fold">
          <summary>{m.menu}</summary>
          <ul className="menu-items">{items.map((item, i) => <li key={i}>
            <span className="menu-items__it" lang="it">{italianItems[i] ?? item}</span>
            {locale !== 'it' && <span className="menu-items__gloss">{item}</span>}
          </li>)}</ul>
        </details>
      )}
      <details className="claim-fold">
        <summary>{m.notes}</summary>
        <ol className="use-steps">{t.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <p className="small-copy">{copy.conditions}</p>
      </details>
      <dialog ref={dialog} className="claim-dialog" aria-labelledby="email-sign-in" onClose={() => setLoginOpen(false)}>
        <div className="claim-dialog__body">
          <button type="button" className="claim-dialog__close" onClick={closeLogin} aria-label={t.dialogClose}><Icon name="close" /></button>
          <p className="claim-dialog__summary"><strong>{course?.name ?? copy.name}</strong> · <span>{discountLabel(benefit.discountCents, locale)}</span></p>
          {loginOpen && <EmailSignIn locale={locale} enabled={authEnabled} destination="coupon" returnTo={returnTo} />}
        </div>
      </dialog>
    </section>
  );
}
