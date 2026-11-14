import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getCatalog } from '@/lib/catalog/load';
import { couponContext, serverCampaignStatus, serverCouponWallet } from '@/lib/coupons/server';
import { couponCopy } from '@/lib/coupons/copy';
import Link from 'next/link';
import { getCatalogRoutes, makeRouteRegistry, pathFor } from '@/lib/catalog/routes';
import { claimPath, offerValue } from '@/lib/coupons/offer';
import { daysLeft } from '@/lib/coupons/ux';
import { promoHeadline, promoWindow } from '@/lib/coupons/promo';
import { couponVisit } from '@/lib/coupons/visit';
import { CouponClaimForm, type HeldCoupon } from '@/components/coupons/CouponClaimForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function generateStaticParams() { return getCatalog().offers.filter((o) => o.benefit).map((o) => ({ campaign: o.benefit!.campaignId })); }

const titles = { zh: '领取优惠券 | Palazzo Italia-Cina', it: 'Richiedi il coupon | Palazzo Italia-Cina', en: 'Claim your coupon | Palazzo Italia-Cina' } as const;
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLocale(lang) ? titles[lang] : titles.en, robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

export default async function ClaimPage({ params, searchParams }: { params: Promise<{ lang: string; campaign: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { lang, campaign } = await params;
  if (!isLocale(lang)) notFound();
  const catalog = getCatalog();
  const offer = catalog.offers.find((o) => o.benefit?.campaignId === campaign);
  if (!offer) notFound();
  const place = catalog.places.find((p) => p.id === offer.placeId);
  const query = await searchParams;
  const [context, status] = await Promise.all([couponContext(), serverCampaignStatus(campaign)]);
  const open = status ? status.open : null, promo = status?.promo;
  const signedIn = context.kind === 'ready';
  const restaurant = place?.translations[lang].name ?? '';
  const address = place?.facts.address;
  // A signed-in person who still holds an unused coupon for this campaign sees it, not a second claim button.
  let held: HeldCoupon | null = null, claimedBefore = 0;
  if (signedIn) {
    const wallet = await serverCouponWallet();
    const found = wallet.kind === 'found' ? wallet.wallet.coupons.find((o) => o.coupon.campaignId === campaign && o.coupon.status === 'unused' && o.path) : undefined;
    // The database allows two claims per account and menu; the page says so up front instead of after a tap.
    if (wallet.kind === 'found') claimedBefore = wallet.wallet.coupons.filter((o) => o.coupon.campaignId === campaign && o.coupon.status !== 'revoked').length;
    if (found) held = { path: found.path!, expiresOn: found.coupon.expiresOn, daysLeft: daysLeft(new Date().toISOString(), found.coupon.expiresOn), shortCode: found.coupon.shortCode ?? null };
  }
  const others = catalog.offers
    .filter((o) => o.placeId === offer.placeId && o.id !== offer.id && o.benefit && o.status !== 'paused')
    .map((o) => ({ id: o.id, name: o.translations[lang].courses[0]?.name ?? o.translations[lang].name, value: offerValue(o, lang), href: claimPath(o, lang)! }));
  return (
    <main id="main-content" className="content-page container claim-page" tabIndex={-1}>
      <header className="page-introduction">
        <p className="eyebrow" lang="it">{restaurant}{address ? ` · ${address.split(',')[0]}` : ''}</p>
        <h1>{offer.translations[lang].courses[0]?.name ?? offer.translations[lang].name}</h1>
      </header>
      {promo && promo.state !== 'ended' && <p className={`promo-banner promo-banner--${promo.state}`}><strong>{promoHeadline(promo, lang)}</strong><span>{promoWindow(promo, lang)}</span></p>}
      {(open === false || claimedBefore >= 2 || (promo?.state === 'sold_out' && !signedIn)) && !held ? <section className="state-panel claim-paused" aria-live="polite"><p>{open === false ? couponCopy[lang].errors.paused : claimedBefore >= 2 ? couponCopy[lang].errors.claim_limit : couponCopy[lang].errors.sold_out}</p>{place && <Link className="button button--secondary" href={pathFor(makeRouteRegistry(getCatalogRoutes(catalog)), `place:${place.id}`, lang) ?? `/${lang}/`}>{place.translations[lang].name}</Link>}</section>
      : <CouponClaimForm locale={lang} offer={offer} restaurant={restaurant} signedIn={signedIn} authEnabled={process.env.AUTH_EMAIL_ENABLED !== 'false'} autoClaim={query.go === '1'} held={held} others={others} directions={couponVisit(offer, place, lang)?.google ?? null} booking={couponVisit(offer, place, lang)?.booking ?? null}  />}
    </main>
  );
}
