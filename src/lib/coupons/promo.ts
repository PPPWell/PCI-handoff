import type { Locale } from '../i18n';

/** A limited promotion (e.g. 11.11): a window and a number of coupons shared by several campaigns. Read from the database. */
export type PromoState = 'upcoming' | 'live' | 'ended' | 'sold_out';
export interface PromoStatus { state: PromoState; startsAt: string; endsAt: string; max: number; remaining: number }
export interface CampaignStatus { open: boolean; promo?: PromoStatus }

const states: readonly string[] = ['upcoming', 'live', 'ended', 'sold_out'];
const instant = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));

export function parseCampaignStatus(raw: unknown): CampaignStatus | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.open !== 'boolean') return null;
  if (v.promo === undefined) return { open: v.open };
  const p = v.promo as Record<string, unknown> | null;
  if (typeof p !== 'object' || p === null || typeof p.state !== 'string' || !states.includes(p.state) || !instant(p.startsAt) || !instant(p.endsAt)
    || !Number.isInteger(p.max) || !Number.isInteger(p.remaining) || (p.max as number) < 1 || (p.remaining as number) < 0) return null;
  return { open: v.open, promo: { state: p.state as PromoState, startsAt: p.startsAt as string, endsAt: p.endsAt as string, max: p.max as number, remaining: p.remaining as number } };
}

const text = {
  zh: { badge: (max: number) => `11.11 限量 ${max} 张`, left: (n: number) => `还剩 ${n} 张`, italy: '意大利时间', china: '北京时间', range: (a: string, b: string) => `${a} 至 ${b}`, locale: 'zh-CN' },
  it: { badge: (max: number) => `11.11 · ${max} coupon in tutto`, left: (n: number) => (n === 1 ? 'ne resta 1' : `ne restano ${n}`), italy: 'Ora italiana', china: 'ora di Pechino', range: (a: string, b: string) => `${a} – ${b}`, locale: 'it-IT' },
  en: { badge: (max: number) => `11.11 · ${max} coupons only`, left: (n: number) => (n === 1 ? '1 left' : `${n} left`), italy: 'Italian time', china: 'Beijing time', range: (a: string, b: string) => `${a} – ${b}`, locale: 'en-GB' },
} as const;

/** The last minute of the window is shown as its end ("11 Nov 23:59"), not as midnight of the next day. */
function span(promo: PromoStatus, lang: Locale, timeZone: string) {
  const t = text[lang];
  const format = (ms: number) => new Intl.DateTimeFormat(t.locale, { timeZone, month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  return t.range(format(Date.parse(promo.startsAt)), format(Date.parse(promo.endsAt) - 60_000));
}

/** Window in Italian and Beijing time, so the offer reads the same for both audiences. */
export function promoWindow(promo: PromoStatus, lang: Locale) {
  const t = text[lang];
  return `${t.italy} ${span(promo, lang, 'Europe/Rome')} (${t.china} ${span(promo, lang, 'Asia/Shanghai')})`;
}

export function promoHeadline(promo: PromoStatus, lang: Locale) {
  const t = text[lang];
  return promo.state === 'live' ? `${t.badge(promo.max)} · ${t.left(promo.remaining)}` : t.badge(promo.max);
}
