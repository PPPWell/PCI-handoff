'use client';
import { showDialog, closeDialog } from '@/lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { CouponView } from '@/lib/coupons/types';
import type { Locale } from '@/lib/i18n';
import { couponCopy } from '@/lib/coupons/copy';
import { bookingCopy, claimCopy, daysLeft, euro, daysLeftLabel, discountAmount, discountLabel, formatDay, formatRomeTime, italianTimeNote, mealNowLabel, mealWindowLabel, mealWindowNow, romeClock, romeClockLabel, spacedCode, staffCopy, type CouponPricing } from '@/lib/coupons/ux';
import type { CouponVisit } from '@/lib/coupons/visit';
import { Icon } from '@/components/ui/Icon';
import { LiveVoucherRefresh } from '@/components/vouchers/LiveVoucherRefresh';

type WakeLockSentinelLike = { release: () => Promise<void> };

const extra = {
  zh: { closedBody: '这张券已不能使用。', more: '看看其他推荐' },
  it: { closedBody: 'Questo coupon non è più utilizzabile.', more: 'Scopri altri locali' },
  en: { closedBody: 'This coupon can no longer be used.', more: 'See more places' },
} as const;

const doneCopy = {
  zh: { title: '核销成功', save: (a: string) => `本餐立省 ${a}`, at: '核销时间', again: '再领一张这个套餐', note: '每次到店用一张券；每个账户每个套餐最多领取两张。' },
  it: { title: 'Coupon convalidato', save: (a: string) => `Su questo pasto risparmi ${a}`, at: 'Convalidato il', again: 'Richiedi di nuovo questo coupon', note: 'Un coupon per visita; al massimo due per menù e per account.' },
  en: { title: 'Coupon redeemed', save: (a: string) => `You save ${a} on this meal`, at: 'Redeemed', again: 'Get this coupon again', note: 'One coupon per visit; at most two per menu and account.' },
} as const;

const fold = {
  zh: { menu: '套餐内容与价格', rules: '使用规则', help: '用券遇到问题？' },
  it: { menu: 'Menù e prezzo', rules: 'Regole d’uso', help: 'Problemi con il coupon?' },
  en: { menu: 'Menu and price', rules: 'How it works', help: 'Trouble with the coupon?' },
} as const;

const visitCopy = {
  zh: { title: '到店', hours: '营业时间', directions: '导航到店', apple: 'Apple 地图' },
  it: { title: 'Come arrivare', hours: 'Orari', directions: 'Indicazioni', apple: 'Apple Maps' },
  en: { title: 'Getting there', hours: 'Hours', directions: 'Directions', apple: 'Apple Maps' },
} as const;

export function CouponPass({ view, locale, token, qrDataUrl, pricing, includes, visit }: { view: CouponView; locale: Locale; token: string; qrDataUrl: string | null; pricing: CouponPricing | null; includes: string | null; visit: CouponVisit | null }) {
  const c = couponCopy[locale];
  const t = claimCopy[locale];
  const coupon = view.coupon;
  const copy = coupon.translations[locale];
  const unused = coupon.status === 'unused';
  const italian = coupon.translations.it;
  const left = unused ? daysLeft(view.serverNow, coupon.expiresOn) : null;
  const v = visitCopy[locale];
  // Server time first (so the first paint matches), then the phone clock once a minute while the page stays open.
  const [now, setNow] = useState(() => new Date(view.serverNow));
  useEffect(() => {
    if (!unused) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [unused]);
  // Only trust the catalogue's windows while they still read exactly like the text frozen on this coupon.
  const windows = visit && copy.window && visit.windows.length && mealWindowLabel(visit.windows, locale) === copy.window ? visit.windows : null;
  const mealNow = unused && windows ? mealWindowNow(windows, now) : null;
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wake = useRef<WakeLockSentinelLike | null>(null);
  const router = useRouter();
  const [presenting, setPresenting] = useState(false);
  const done = doneCopy[locale];

  // While the coupon is held up to staff, check every 5 seconds so the "redeemed" moment shows as soon as they confirm.
  useEffect(() => {
    if (!presenting || !unused) return;
    const timer = window.setInterval(() => { if (navigator.onLine) router.refresh(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [presenting, unused, router]);
  useEffect(() => { if (!unused) releaseWake(); }, [unused]);

  function show() {
    if (dialog.current && !dialog.current.open) { showDialog(dialog.current); setPresenting(true); }
  }
  async function acquireWake() {
    try {
      const lock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
      if (lock) wake.current = await lock.request('screen');
    } catch {
      /* Screen wake lock is a convenience; presenting works without it. */
    }
  }
  function releaseWake() {
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
  }

  // "#present" opens the staff view straight away (used by the claim-success button).
  useEffect(() => {
    if (unused && qrDataUrl && window.location.hash === '#present') show();
    return releaseWake;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = copy.menu ?? copy.name;
  return (
    <main id="main-content" className="content-page container live-voucher-page coupon-pass" tabIndex={-1}>
      <LiveVoucherRefresh />

      {/* Just redeemed: the moment comes first, above the spent coupon. */}
      {coupon.status === 'used' && (
        <section className="content-section coupon-done" aria-labelledby="coupon-thanks" role="status">
          <span className="coupon-done__check" aria-hidden="true"><Icon name="check" /></span>
          <h2 id="coupon-thanks">{done.title}</h2>
          <p className="coupon-done__save">{done.save(euro(coupon.discountCents, locale))}</p>
          {coupon.redeemedAt && <p className="small-copy">{done.at} {formatRomeTime(coupon.redeemedAt, locale)}</p>}
          <div className="state-actions">
            {visit?.claim && <a className="button button--primary" href={visit.claim}>{done.again}</a>}
            <Link className="button button--secondary" href={`/${locale}/`}>{extra[locale].more}</Link>
          </div>
        </section>
      )}
      {!unused && coupon.status !== 'used' && (
        <section className="content-section coupon-done coupon-done--closed" aria-labelledby="coupon-thanks">
          <h2 id="coupon-thanks">{c.status[coupon.status]}</h2>
          <p>{extra[locale].closedBody}</p>
          <div className="state-actions">
            {visit?.claim && <a className="button button--primary" href={visit.claim}>{done.again}</a>}
            <Link className="button button--secondary" href={`/${locale}/`}>{extra[locale].more}</Link>
          </div>
        </section>
      )}

      {/* The counter screen: amount, menu, can I use it now, QR, code, one button. Everything else is folded below. */}
      <section className={`coupon-ticket coupon-ticket--page coupon-ticket--${coupon.status}`} aria-labelledby="coupon-title">
        <p className="coupon-ticket__status"><span className="badge">{c.status[coupon.status]}</span>{left !== null && <span className={`days-left${left <= 7 ? ' days-left--soon' : ''}`}>{daysLeftLabel(left, locale)}</span>}</p>
        <strong className="coupon-ticket__value">{discountLabel(coupon.discountCents, locale)}</strong>
        <h1 id="coupon-title" className="coupon-ticket__name">{name}</h1>
        <p className="coupon-ticket__place" lang="it">{coupon.restaurant.name}</p>
        {mealNow && (
          <p className={`meal-now meal-now--${mealNow.state === 'open' ? 'open' : 'closed'}`} role="status">
            <strong>{mealNowLabel(mealNow, locale, left === 0)}</strong>
            <span>{romeClockLabel[locale]} {romeClock(now)}</span>
          </p>
        )}
        {unused && qrDataUrl && (
          <figure className="coupon-ticket__qr">
            <Image src={qrDataUrl} alt="QR" width={192} height={192} unoptimized />
          </figure>
        )}
        {unused && coupon.shortCode && <p className="coupon-ticket__code"><span>{t.codeLabel}</span> <strong>{spacedCode(coupon.shortCode)}</strong></p>}
        {unused && qrDataUrl && (
          <div className="coupon-actions">
            <button ref={opener} type="button" className="button button--primary coupon-actions__main" onClick={() => { show(); void acquireWake(); }}>{t.showToStaff}</button>
          </div>
        )}
        {unused && !qrDataUrl && <p role="status">{c.noLink}</p>}

        <div className="coupon-ticket__details">
          {(visit && (visit.photo || visit.dishes.length > 0) || pricing || includes) && (
            <details className="coupon-fold">
              <summary>{fold[locale].menu}{pricing && <span className="coupon-fold__aside">{pricing.menu} → {pricing.coupon}</span>}</summary>
              {visit && (visit.photo || visit.dishes.length > 0) && <div className="coupon-dish">
                {visit.photo && <Image className="coupon-dish__photo" src={visit.photo.url} alt={visit.photo.alt[locale]} width={96} height={120} />}
                {visit.dishes.length > 0 && <p className="small-copy">{visit.dishes.join(' · ')}</p>}
              </div>}
              {!(visit?.dishes.length) && includes && <p className="small-copy">{includes}</p>}
              {pricing && <p className="coupon-ticket__price">{pricing.menu} → <strong>{pricing.coupon}</strong> · {t.youSave} {pricing.save}</p>}
            </details>
          )}
          <details className="coupon-fold">
            <summary>{fold[locale].rules}</summary>
            {copy.window && <p className="small-copy">{t.window}：{copy.window}</p>}
            <p className="small-copy">{copy.conditions}</p>
            <p className="small-copy">{c.pay} {c.expiry} {formatDay(coupon.expiresOn, locale)}</p>
            {unused && qrDataUrl && <p className="small-copy"><a className="text-link" href={`/c/${encodeURIComponent(token)}/qr.png/?download=1`} download rel="noreferrer">{t.saveImage}</a></p>}
            <p className="small-copy"><Link className="text-link" href={`/${locale}/help/`}>{fold[locale].help}</Link></p>
          </details>
        </div>
      </section>

      {unused && visit && (visit.google || visit.apple || visit.booking) && (
        <section className="content-section coupon-visit" aria-labelledby="coupon-visit">
          <h2 id="coupon-visit">{v.title}</h2>
          <p lang="it">{visit.address}</p>
          <p className="small-copy">{v.hours} {visit.hours}{italianTimeNote[locale]}</p>
          {visit.booking && <p className="small-copy">{bookingCopy[locale].note(visit.windows.length ? mealWindowLabel(visit.windows, locale) : '')}</p>}
          <div className="state-actions">
            {visit.booking && <a className="button button--primary" href={visit.booking} rel="noopener noreferrer" data-track="booking_clicked" data-track-item="coupon">{bookingCopy[locale].label}</a>}
            {visit.google && <a className="button button--secondary" href={visit.google} rel="noopener noreferrer"><Icon name="pin" />{v.directions}</a>}
            {visit.apple && <a className="text-link" href={visit.apple} rel="noopener noreferrer">{v.apple}</a>}
          </div>
        </section>
      )}

      {unused && qrDataUrl && (
        <dialog ref={dialog} className="present-dialog" lang="it" aria-labelledby="present-title" onClose={() => { setPresenting(false); releaseWake(); opener.current?.focus(); }}>
          <div className="present">
            <p className="present__kicker">{staffCopy.kicker}</p>
            <h2 id="present-title" className="present__restaurant">{coupon.restaurant.name}</h2>
            <p className="present__value">{discountAmount(coupon.discountCents, 'it')}</p>
            <p className="present__menu">{italian.menu ?? staffCopy.menuLine}</p>
            {italian.pay && <p className="present__pay"><span>{staffCopy.toPay}</span> {italian.list && <s>{italian.list}</s>} <strong>{italian.pay}</strong></p>}
            {italian.window && <p className="present__meta"><strong>{staffCopy.window}</strong> {italian.window}</p>}
            <Image className="present__qr" src={qrDataUrl} alt="QR" width={384} height={384} unoptimized priority />
            <p className="present__code"><span>{staffCopy.code}</span> <strong>{spacedCode(coupon.shortCode)}</strong></p>
            <p className="present__meta">{staffCopy.validUntil} {formatDay(coupon.expiresOn, 'it')}</p>
            <button type="button" className="text-link present__close" lang={locale} onClick={() => closeDialog(dialog.current)}>{t.closePresent}</button>
            <p className="present__customer-hint" lang={locale}>{t.presentHint} {t.brightness}</p>
          </div>
        </dialog>
      )}
    </main>
  );
}
