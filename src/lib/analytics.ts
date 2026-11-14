import { analyticsEnabled, readConsent } from "./consent";

/** PostHog (EU data centre) over a plain HTTPS call: no script, no cookie, no new dependency. Nothing is sent until the visitor has
 * accepted analytics in the cookie banner, and nothing at all unless the key is set. Purchases, redemptions and refunds are counted
 * from the database and Stripe, never from here. */
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY, host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const ID_KEY = "pci:analytics-id";
export const CHANNEL_KEY = "pci:channel";

/** The event dictionary lives in docs/tracking-plan.md; names are object_action, and a test keeps the two in step. */
export const analyticsEvents = [
  "page_viewed", "place_viewed", "guide_viewed", "nav_clicked", "language_switched", "directions_clicked", "booking_clicked", "address_copied",
  "claim_started", "signin_started", "signin_code_sent", "subscribe_submitted", "cookie_choice",
  "install_card_shown", "install_link_opened", "install_prompt_accepted", "install_prompt_dismissed", "install_later", "app_installed", "app_opened_standalone",
] as const;
export type AnalyticsEvent = (typeof analyticsEvents)[number];

/** Coupon and voucher links carry secret tokens: they never leave the browser in an event. */
export function cleanPath(pathname: string): string {
  return pathname.replace(/^\/(c|v|go)\/[^/]+/, "/$1/:token").replace(/\/(claim|verify)\/[^/]+/, "/$1/:id");
}
/** A random id that only exists after consent, lives in this browser's localStorage and is never joined to an email or account. */
function visitorId(): string {
  try {
    const saved = window.localStorage.getItem(ID_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    window.localStorage.setItem(ID_KEY, id);
    return id;
  } catch { return "anonymous"; }
}
/** Withdrawing consent also forgets the id. */
export function forgetVisitor(): void {
  try { window.localStorage.removeItem(ID_KEY); window.sessionStorage.removeItem(CHANNEL_KEY); } catch { /* nothing to forget */ }
}
/** Poster/flyer channel the visit started from (set by the /go redirect, kept for the tab session). */
export function currentChannel(): string {
  try { return window.sessionStorage.getItem(CHANNEL_KEY) ?? ""; } catch { return ""; }
}
function commonProperties(): Record<string, string> {
  const channel = currentChannel();
  const lang = window.location.pathname.split("/")[1];
  return { locale: ["zh", "it", "en"].includes(lang) ? lang : "", device: window.matchMedia?.("(max-width: 767px)").matches ? "mobile" : "desktop", ...(channel ? { channel } : {}) };
}
export function track(event: AnalyticsEvent, properties: Record<string, string | number | boolean> = {}): void {
  if (!analyticsEnabled || !key || typeof window === "undefined" || readConsent()?.analytics !== true) return;
  try {
    void fetch(`${host}/capture/`, {
      method: "POST", keepalive: true, credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, event, distinct_id: visitorId(), properties: { ...commonProperties(), ...properties, $current_url: cleanPath(window.location.pathname), $process_person_profile: false, $ip: null } }),
    }).catch(() => { /* analytics must never break the page */ });
  } catch { /* same */ }
}
