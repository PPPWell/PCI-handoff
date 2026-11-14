import type { CouponView } from '@/lib/coupons/types';
import type { Locale } from '@/lib/i18n';
import type { CouponPricing } from '@/lib/coupons/ux';
import type { CouponVisit } from '@/lib/coupons/visit';
import { CouponPass } from '@/components/coupons/CouponPass';

/** Customer-facing coupon page. The interactive "show to staff" state lives in CouponPass. */
export function CouponCustomer({ view, locale, token, qrDataUrl, pricing, includes, visit }: { view: CouponView; locale: Locale; token: string; qrDataUrl?: string | null; pricing?: CouponPricing | null; includes?: string | null; visit?: CouponVisit | null }) {
  return <CouponPass view={view} locale={locale} token={token} qrDataUrl={qrDataUrl ?? null} pricing={pricing ?? null} includes={includes ?? null} visit={visit ?? null} />;
}
