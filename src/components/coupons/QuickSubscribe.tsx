'use client';
import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import type { SubscriptionPreferences } from '@/lib/coupons/types';
import { applySubscribeIntent, readPreferences, writeSubscription } from '@/lib/coupons/subscribe-intent';

const text = {
  zh: { label: '订阅新套餐和活动邮件（可选，随时退订）', done: '已订阅新套餐和活动邮件，可随时退订。', failed: '暂时没能订阅，请稍后再试。' },
  it: { label: 'Iscrivimi a nuovi menù e novità (facoltativo, annulli quando vuoi)', done: 'Iscrizione attiva. Puoi annullarla quando vuoi.', failed: 'Non siamo riusciti a iscriverti. Riprova più tardi.' },
  en: { label: 'Email me new menus and news (optional, unsubscribe any time)', done: 'You are subscribed. Unsubscribe any time.', failed: 'Could not subscribe just now. Please try again later.' },
};

/** One checkbox for signed-in people: ticking it subscribes at once. Applies a tick made in the sign-in dialog. */
export function QuickSubscribe({ locale }: { locale: Locale }) {
  const t = text[locale];
  const [prefs, setPrefs] = useState<SubscriptionPreferences | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const first = await readPreferences();
      const after = first ? await applySubscribeIntent(locale, first) : null;
      if (live) { setPrefs(after ?? first); setReady(true); }
    })();
    return () => { live = false; };
  }, [locale]);

  if (!ready || !prefs) return null;
  if (prefs.subscribed) return <p className="small-copy" role="status">{t.done}</p>;
  async function tick(on: boolean) {
    if (!on || !prefs || pending) return;
    setPending(true); setFailed(false);
    const next = await writeSubscription(locale, true, prefs);
    if (next) setPrefs(next); else setFailed(true);
    setPending(false);
  }
  return <div>
    <label className="checkbox-row"><input type="checkbox" checked={false} disabled={pending} onChange={(e) => void tick(e.target.checked)} />{t.label}</label>
    {failed && <p role="alert" className="small-copy">{t.failed}</p>}
  </div>;
}
