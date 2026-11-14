import { loadServerCoupon, couponLocale, serverStaffCoupon, serverCouponWallet } from '@/lib/coupons/server';
import { makeCouponQr } from '@/lib/coupons/qr';
import { CouponCustomer } from '@/components/coupons/CouponCustomer';
import { CouponMerchantPanel, StaffOtherRestaurant } from '@/components/coupons/CouponMerchantPanel';
import { serverIsStaffAnywhere } from '@/lib/merchant/staff-server';
import { StatePanel } from '@/components/states/StatePanel';
import { StaffTopbar } from '@/components/merchant/StaffShell';
import { getCatalog } from '@/lib/catalog/load';
import { couponIncludes, couponPricing } from '@/lib/coupons/ux';
import { couponVisit } from '@/lib/coupons/visit';

export default async function CouponPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const asCustomer = (await searchParams).as === 'customer';
  const result = await loadServerCoupon(token);
  const locale = await couponLocale(result);
  if (result.kind !== 'found') return <StatePanel locale={locale} variant={result.kind === 'not-found' ? 'missing' : 'error'} />;
  const merchant = await serverStaffCoupon(token);
  // Staff phones get the staff frame; the customer header and footer of this layout are hidden by .staff-shell.
  if (merchant.kind === 'found') return <div className="staff-shell" lang="it"><StaffTopbar restaurant={merchant.view.coupon.restaurant.name} /><CouponMerchantPanel view={merchant.view} /></div>;
  // A signed-in restaurant member scanning another restaurant's coupon; ?as=customer still opens it as a customer.
  if (!asCustomer && merchant.kind === 'not-found' && await serverIsStaffAnywhere()) return <div className="staff-shell" lang="it"><StaffTopbar /><StaffOtherRestaurant restaurant={result.view.coupon.restaurant.name} customerHref={`/c/${encodeURIComponent(token)}/?as=customer`} /></div>;
  const qr = await makeCouponQr(token, result.view, process.env.SITE_ORIGIN);
  // Price breakdown comes from the current published offer for this campaign; the frozen discount is on the coupon itself.
  const offer = getCatalog().offers.find((o) => o.benefit?.campaignId === result.view.coupon.campaignId);
  const pricing = offer && offer.benefit?.discountCents === result.view.coupon.discountCents ? couponPricing(offer, locale) : null;
  let visit = couponVisit(offer, getCatalog().places.find((p) => p.id === result.view.coupon.restaurant.placeId), locale);
  // "Get this coupon again" only while the account can still claim this menu (two in all); a visitor who is not signed in keeps it,
  // and the claim page explains the limit if it is reached.
  if (visit?.claim && result.view.coupon.status !== 'unused') {
    const wallet = await serverCouponWallet();
    if (wallet.kind === 'found' && wallet.wallet.coupons.filter((o) => o.coupon.campaignId === result.view.coupon.campaignId && o.coupon.status !== 'revoked').length >= 2) visit = { ...visit, claim: null };
  }
  return <CouponCustomer locale={locale} view={result.view} token={token} qrDataUrl={qr?.dataUrl} pricing={pricing} includes={offer ? couponIncludes(offer, locale) : null} visit={visit} />;
}
