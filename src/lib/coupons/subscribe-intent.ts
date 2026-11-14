import type { Locale } from '../i18n';
import { parsePreferences, type SubscriptionPreferences } from './types';

const KEY = 'pci:subscribe-intent';

/** Remembers, across the sign-in reload, that the person ticked "also subscribe". Storage may be blocked; that just means no auto-subscribe. */
export function setSubscribeIntent(on: boolean) {
  try { if (on) window.sessionStorage.setItem(KEY, '1'); else window.sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function hasSubscribeIntent(): boolean {
  try { return window.sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** Reads the signed-in person's subscription preferences; null when signed out or on any failure. */
export async function readPreferences(): Promise<SubscriptionPreferences | null> {
  try {
    const r = await fetch('/api/subscriptions/preferences/', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return parsePreferences(await r.json());
  } catch { return null; }
}

/** Opts the signed-in person in or out. Returns the new preferences, or null if it did not go through. */
export async function writeSubscription(locale: Locale, optedIn: boolean, current: SubscriptionPreferences): Promise<SubscriptionPreferences | null> {
  try {
    const r = await fetch('/api/subscriptions/preferences/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optedIn, locale, requestId: crypto.randomUUID(), revision: current.revision }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    const raw = await r.json();
    if (!r.ok || raw?.ok !== true) return null;
    return parsePreferences(raw);
  } catch { return null; }
}

/** After sign-in: if the box was ticked and the person is not yet subscribed, subscribe once and clear the marker. */
export async function applySubscribeIntent(locale: Locale, known?: SubscriptionPreferences | null): Promise<SubscriptionPreferences | null> {
  if (!hasSubscribeIntent()) return known ?? null;
  const current = known ?? await readPreferences();
  if (!current) return null;
  if (current.subscribed) { setSubscribeIntent(false); return current; }
  const next = await writeSubscription(locale, true, current);
  if (next) setSubscribeIntent(false);
  return next ?? current;
}
