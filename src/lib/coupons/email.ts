import type { Locale } from '../i18n';
import { spacedCode, formatDay, discountLabel } from './ux';

export interface CouponEmailInput {
  locale: Locale; to: string; link: string; shortCode: string; expiresOn: string; discountCents: number; couponName: string; restaurant: string; couponId: string;
}
export interface CouponEmailConfig { enabled: boolean; resendKey?: string; from?: string; replyTo?: string; origin?: string }

const t = {
  zh: { subject: (c: string) => `你的 ${c} 优惠券`, hello: '券已保存。到店点券上对应的套餐前，把它给店员看。', code: '出示码', open: '打开优惠券', valid: '有效期至', pay: '餐费到店支付。', why: '这封邮件因你领取优惠券而发送，不含营销内容。' },
  it: { subject: (c: string) => `Il tuo coupon ${c}`, hello: 'Coupon salvato. Mostralo allo staff prima di ordinare il menù indicato sul coupon.', code: 'Codice', open: 'Apri il coupon', valid: 'Valido fino al', pay: 'Si paga al ristorante.', why: 'Email inviata perché hai richiesto un coupon. Nessun contenuto promozionale.' },
  en: { subject: (c: string) => `Your ${c} coupon`, hello: 'Your coupon is saved. Show it to staff before ordering the menu named on it.', code: 'Code', open: 'Open coupon', valid: 'Valid until', pay: 'Pay at the restaurant.', why: 'Sent because you claimed a coupon. No marketing content.' },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plain transactional mail: code first, one link, one line of context. No images, no tracking. */
export function couponEmail(input: CouponEmailInput): { subject: string; html: string; text: string } {
  const c = t[input.locale];
  const code = spacedCode(input.shortCode);
  const discount = discountLabel(input.discountCents, input.locale);
  const until = formatDay(input.expiresOn, input.locale);
  const subject = c.subject(input.restaurant);
  const text = [`${input.restaurant} · ${discount}`, '', c.hello, '', `${c.code}: ${code}`, `${c.valid} ${until}`, c.pay, '', `${c.open}: ${input.link}`, '', c.why].join('\n');
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#f1ede2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2a22"><div style="max-width:480px;margin:0 auto;padding:24px"><p style="margin:0 0 4px;font-size:14px;color:#6b6a5e">${esc(input.restaurant)}</p><h1 style="margin:0 0 16px;font-size:22px">${esc(input.couponName)}</h1><p style="margin:0 0 16px;font-size:16px;line-height:1.5">${esc(c.hello)}</p><div style="background:#fff;border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="margin:0;font-size:13px;color:#6b6a5e">${esc(c.code)}</p><p style="margin:4px 0 8px;font-size:34px;letter-spacing:4px;font-weight:700">${esc(code)}</p><p style="margin:0;font-size:14px">${esc(c.valid)} ${esc(until)} · ${esc(c.pay)}</p></div><p style="margin:0 0 20px"><a href="${esc(input.link)}" style="display:inline-block;background:#2b3a2d;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:16px">${esc(c.open)}</a></p><p style="margin:0;font-size:12px;color:#6b6a5e">${esc(c.why)}</p></div></body></html>`;
  return { subject, html, text };
}

/** Best-effort: never throws, never blocks the claim for long. One mail per coupon (Idempotency-Key). */
export async function sendCouponEmail(config: CouponEmailConfig, input: CouponEmailInput, transport: typeof fetch = fetch): Promise<boolean> {
  try {
    if (!config.enabled || !config.resendKey || !config.from || !config.origin) return false;
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.to) || !/^[0-9]{3}-[0-9]{3}$/.test(input.shortCode)) return false;
    const origin = new URL(config.origin);
    if (origin.protocol !== 'https:' && !(origin.hostname === '127.0.0.1' || origin.hostname === 'localhost')) return false;
    const mail = couponEmail(input);
    const body = JSON.stringify({ from: config.from, to: [input.to], subject: mail.subject, html: mail.html, text: mail.text, ...(config.replyTo ? { reply_to: config.replyTo } : {}) });
    const response = await transport('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pci-coupon-claimed/${input.couponId}` }, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch { return false; }
}

export function couponEmailConfig(env: NodeJS.ProcessEnv = process.env): CouponEmailConfig {
  return { enabled: env.COUPON_EMAIL_ENABLED === 'true', resendKey: env.RESEND_API_KEY, from: env.MAIL_FROM, replyTo: env.MAIL_REPLY_TO, origin: env.SITE_ORIGIN };
}
