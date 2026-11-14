import { createHash, timingSafeEqual } from "node:crypto";
import type { Locale } from "../i18n";
import { isLocale } from "../i18n";
import { daysLeft, daysLeftLabel, discountLabel, formatDay } from "./ux";
import { couponEmailConfig, type CouponEmailConfig } from "./email";

// Two days ahead: coupons now last a week, so a seven-day window would remind people the day after they claim.
export const REMINDER_DAYS = 2;

export interface DueReminder { couponId: string; email: string; language: Locale; expiresOn: string; restaurant: string; couponName: string; discountCents: number }
export interface ReminderMailInput { locale: Locale; to: string; link: string; expiresOn: string; days: number; discountCents: number; couponName: string; restaurant: string; couponId: string }

const t = {
  zh: { subject: (r: string, left: string) => `你在 ${r} 的优惠券${left}`, line: '这张券还没有使用。到店点券上对应的套餐前，把它出示给店员。', valid: '有效期至', open: '打开我的券', why: '这封邮件是因为你领取了这张优惠券，每张券只提醒一次，不含营销内容。' },
  it: { subject: (r: string, left: string) => `Il tuo coupon da ${r}: ${left.toLowerCase()}`, line: 'Il coupon non è ancora stato usato. Mostralo allo staff prima di ordinare il menù indicato sul coupon.', valid: 'Valido fino al', open: 'Apri i miei coupon', why: 'Email inviata perché hai richiesto questo coupon. Un solo promemoria per coupon, senza contenuti promozionali.' },
  en: { subject: (r: string, left: string) => `Your ${r} coupon: ${left.toLowerCase()}`, line: 'This coupon has not been used yet. Show it to staff before ordering the menu named on it.', valid: 'Valid until', open: 'Open my coupons', why: 'Sent because you claimed this coupon. One reminder per coupon, no promotional content.' },
} as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain transactional reminder: how many days are left, one link to the wallet, no tracking, no marketing. */
export function couponReminderEmail(input: ReminderMailInput): { subject: string; html: string; text: string } {
  const c = t[input.locale], left = daysLeftLabel(input.days, input.locale), until = formatDay(input.expiresOn, input.locale), discount = discountLabel(input.discountCents, input.locale);
  const subject = c.subject(input.restaurant, left);
  const text = [`${input.restaurant} · ${discount}`, '', `${left} · ${c.valid} ${until}`, c.line, '', `${c.open}: ${input.link}`, '', c.why].join('\n');
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#f1ede2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2a22"><div style="max-width:480px;margin:0 auto;padding:24px"><p style="margin:0 0 4px;font-size:14px;color:#6b6a5e">${esc(input.restaurant)}</p><h1 style="margin:0 0 16px;font-size:22px">${esc(input.couponName)}</h1><div style="background:#fff;border-radius:12px;padding:16px 20px;margin:0 0 16px"><p style="margin:0;font-size:28px;font-weight:700;color:#a33a2b">${esc(left)}</p><p style="margin:4px 0 0;font-size:14px">${esc(c.valid)} ${esc(until)}</p></div><p style="margin:0 0 16px;font-size:16px;line-height:1.5">${esc(c.line)}</p><p style="margin:0 0 20px"><a href="${esc(input.link)}" style="display:inline-block;background:#a33a2b;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:16px">${esc(c.open)}</a></p><p style="margin:0;font-size:12px;color:#6b6a5e">${esc(c.why)}</p></div></body></html>`;
  return { subject, html, text };
}

/** Best-effort send of one reminder. One mail per coupon (Idempotency-Key); false means "try again tomorrow". */
export async function sendCouponReminder(config: CouponEmailConfig, input: ReminderMailInput, transport: typeof fetch = fetch): Promise<boolean> {
  try {
    if (!config.enabled || !config.resendKey || !config.from || !config.origin) return false;
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.to)) return false;
    const mail = couponReminderEmail(input);
    const response = await transport("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${config.resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `pci-coupon-reminder/${input.couponId}` }, body: JSON.stringify({ from: config.from, to: [input.to], subject: mail.subject, html: mail.html, text: mail.text, ...(config.replyTo ? { reply_to: config.replyTo } : {}) }), cache: "no-store", signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch { return false; }
}

function parseDue(value: unknown): DueReminder[] {
  if (!Array.isArray(value)) throw new Error("bad reminder list");
  return value.map((raw) => {
    const r = raw as Record<string, unknown>;
    if (typeof r.couponId !== "string" || typeof r.email !== "string" || typeof r.language !== "string" || !isLocale(r.language) || typeof r.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.expiresOn) || typeof r.restaurant !== "string" || typeof r.couponName !== "string" || !Number.isSafeInteger(r.discountCents)) throw new Error("bad reminder row");
    return { couponId: r.couponId, email: r.email, language: r.language, expiresOn: r.expiresOn, restaurant: r.restaurant, couponName: r.couponName, discountCents: r.discountCents as number };
  });
}

export interface ReminderRun { due: number; sent: number }

/** Sends one reminder per unused coupon that ends within REMINDER_DAYS, then marks it so it is never sent twice. */
export async function runCouponReminders(options: { url?: string; secretKey?: string; email?: CouponEmailConfig; transport?: typeof fetch; now?: () => Date }): Promise<ReminderRun> {
  const transport = options.transport ?? fetch, email = options.email ?? couponEmailConfig(), url = new URL(options.url ?? "");
  if (url.protocol !== "https:" || !/^sb_secret_[A-Za-z0-9_-]+$/.test(options.secretKey ?? "")) throw new Error("Reminders unavailable");
  const call = async (name: string, body: unknown) => {
    const response = await transport(new URL(`/rest/v1/rpc/${name}`, url), { method: "POST", headers: { apikey: options.secretKey!, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Reminders unavailable");
    return response.json() as Promise<unknown>;
  };
  const due = parseDue(await call("pci_coupons_due_reminder", { p_days: REMINDER_DAYS })), nowIso = (options.now?.() ?? new Date()).toISOString();
  let sent = 0;
  for (const coupon of due) {
    const ok = await sendCouponReminder(email, { locale: coupon.language, to: coupon.email, link: `${email.origin}/${coupon.language}/account/`, expiresOn: coupon.expiresOn, days: daysLeft(nowIso, coupon.expiresOn), discountCents: coupon.discountCents, couponName: coupon.couponName, restaurant: coupon.restaurant, couponId: coupon.couponId }, transport);
    if (!ok) continue;
    sent += 1;
    await call("pci_mark_coupon_reminded", { p_id: coupon.couponId }).catch(() => undefined);
  }
  return { due: due.length, sent };
}

/** Same bearer-secret boundary as the voucher maintenance cron. */
export async function handleCouponReminders(request: Request, secret: string | undefined, run: () => Promise<ReminderRun>): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" }, reply = (value: unknown, status: number) => Response.json(value, { status, headers });
  if (request.method !== "GET") return reply({ ok: false, code: "method_not_allowed" }, 405);
  if (!secret || secret.length < 32) return reply({ ok: false, code: "reminders_unavailable" }, 503);
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) return reply({ ok: false, code: "unauthorized" }, 401);
  try { const result = await run(); return reply({ ok: true, ...result }, 200); } catch { return reply({ ok: false, code: "reminders_unavailable" }, 503); }
}
