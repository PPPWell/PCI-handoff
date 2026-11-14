import Image from 'next/image';
import Link from 'next/link';
import type { CouponWallet as Wallet, OwnedCoupon } from '@/lib/coupons/types';
import type { Locale } from '@/lib/i18n';
import { couponCopy } from '@/lib/coupons/copy';
import { daysLeft, daysLeftLabel, discountLabel, formatDay } from '@/lib/coupons/ux';
import { getCatalog } from '@/lib/catalog/load';

const more = {
  zh: { history: '已使用和已过期', open: '打开' },
  it: { history: 'Usati e scaduti', open: 'Apri' },
  en: { history: 'Used and expired', open: 'Open' },
} as const;

/** One coupon as a ticket stub: dish photo, discount, menu, days left; the whole card opens the coupon. */
function Stub({ owned, locale, now }: { owned: OwnedCoupon; locale: Locale; now: string }) {
  const c = couponCopy[locale], v = owned.coupon, unused = v.status === 'unused';
  const photo = getCatalog().offers.find((o) => o.benefit?.campaignId === v.campaignId)?.photos?.[0];
  const left = unused ? daysLeft(now, v.expiresOn) : null;
  const body = <>
    {photo ? <Image className="wallet-stub__photo" src={photo.url} alt="" width={96} height={72} /> : <span className="wallet-stub__photo" aria-hidden="true" />}
    <span className="wallet-stub__text">
      <strong className="wallet-stub__value">{discountLabel(v.discountCents, locale)}</strong>
      <span className="wallet-stub__name">{v.translations[locale].menu ?? v.translations[locale].name}</span>
      <span className="small-copy" lang="it">{v.restaurant.name}</span>
      <span className="wallet-stub__meta">
        <span className="badge">{c.status[v.status]}</span>
        {left !== null ? <span className={`days-left${left <= 7 ? ' days-left--soon' : ''}`}>{daysLeftLabel(left, locale)}</span> : <span className="small-copy">{c.expiry} {formatDay(v.expiresOn, locale)}</span>}
      </span>
    </span>
  </>;
  return <li>{owned.path
    // Plain link: coupon paths keep their trailing slash and carry no client-side prefetch.
    ? <a className={`wallet-stub wallet-stub--${v.status}`} href={`${owned.path}?lang=${locale}`} rel="noreferrer" aria-label={`${more[locale].open}: ${v.translations[locale].name}`}>{body}</a>
    : <div className={`wallet-stub wallet-stub--${v.status}`}>{body}<span className="small-copy">{c.noLink}</span></div>}</li>;
}

/** My coupons: usable ones first, soonest to expire on top; used, expired and withdrawn ones folded below. */
export function CouponWallet({ wallet, locale }: { wallet: Wallet | null; locale: Locale }) {
  const c = couponCopy[locale];
  if (!wallet) return <section id="discount-coupons" className="content-section" aria-labelledby="discount-coupons-title"><h2 id="discount-coupons-title">{c.wallet}</h2><p role="alert">{c.walletUnavailable}</p><a className="text-link" href={`/${locale}/account/`}>{c.refresh}</a></section>;
  const now = new Date().toISOString();
  const usable = wallet.coupons.filter((o) => o.coupon.status === 'unused').sort((a, b) => a.coupon.expiresOn.localeCompare(b.coupon.expiresOn));
  const past = wallet.coupons.filter((o) => o.coupon.status !== 'unused');
  return (
    <section id="discount-coupons" className="content-section" aria-labelledby="discount-coupons-title">
      <h2 id="discount-coupons-title">{c.wallet}</h2>
      {!wallet.coupons.length ? <><p>{c.empty}</p><Link className="text-link" href={`/${locale}/`}>{c.discover}</Link></> : <>
        {usable.length > 0 ? <ul className="wallet-list">{usable.map((o) => <Stub key={o.coupon.id} owned={o} locale={locale} now={now} />)}</ul> : <><p>{c.empty}</p><Link className="text-link" href={`/${locale}/`}>{c.discover}</Link></>}
        {past.length > 0 && <details className="claim-fold wallet-history"><summary>{more[locale].history} · {past.length}</summary><ul className="wallet-list">{past.map((o) => <Stub key={o.coupon.id} owned={o} locale={locale} now={now} />)}</ul></details>}
      </>}
      {wallet.nextCursor && <Link className="text-link" href={`/${locale}/account/?couponsBefore=${encodeURIComponent(wallet.nextCursor)}#discount-coupons`}>{c.older}</Link>}
    </section>
  );
}
