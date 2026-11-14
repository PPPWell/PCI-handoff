'use client';
import { track } from '@/lib/analytics';
import { useState, type FormEvent } from 'react';
import type { Locale } from '@/lib/i18n';

const text = {
  zh: { label: '邮箱', button: '订阅', working: '提交中…', done: '已订阅。新套餐和活动会发到这个邮箱，可随时退订。', invalid: '请检查邮箱格式。', failed: '暂时没能订阅，请稍后再试。', limited: '提交太频繁，请稍后再试。', note: '输入邮箱即订阅，不定期发送，可随时退订。' },
  it: { label: 'Email', button: 'Iscriviti', working: 'Invio…', done: 'Iscrizione attiva. Riceverai nuovi menù e novità a questo indirizzo; puoi annullare quando vuoi.', invalid: 'Controlla l’indirizzo email.', failed: 'Non siamo riusciti a iscriverti. Riprova più tardi.', limited: 'Troppe richieste. Riprova più tardi.', note: 'Inserisci l’email per iscriverti. Ogni tanto, e puoi annullare quando vuoi.' },
  en: { label: 'Email', button: 'Subscribe', working: 'Sending…', done: 'You are subscribed. New menus and news will arrive at this address; unsubscribe any time.', invalid: 'Please check the email address.', failed: 'Could not subscribe just now. Please try again later.', limited: 'Too many requests. Please try again later.', note: 'Enter your email to subscribe. Occasional mail; unsubscribe any time.' },
};

/** One step: email in, subscribed. No confirmation email, no account. */
export function SubscribeForm({ locale, source = 'home', id = 'subscribe-email' }: { locale: Locale; source?: 'home' | 'subscribe-page'; id?: string }) {
  const t = text[locale];
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'invalid' | 'failed' | 'limited'>('idle');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (state === 'pending') return;
    track('subscribe_submitted', { source });
    setState('pending');
    try {
      const response = await fetch('/api/subscriptions/subscribe/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ email, locale, source, website: '' }) });
      const body = await response.json().catch(() => ({}));
      setState(response.ok && body.ok ? 'done' : response.status === 400 ? 'invalid' : response.status === 429 ? 'limited' : 'failed');
    } catch { setState('failed'); }
  }
  if (state === 'done') return <p role="status" className="subscribe-done">{t.done}</p>;
  return <form className="subscribe-form" onSubmit={submit} noValidate={false}>
    <label className="field" htmlFor={id}>{t.label}
      <input id={id} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required placeholder="name@example.com" value={email} disabled={state === 'pending'} onChange={(e) => { setEmail(e.target.value); if (state !== 'pending') setState('idle'); }} />
    </label>
    <button className="button button--primary" type="submit" disabled={state === 'pending'}>{state === 'pending' ? t.working : t.button}</button>
    <p className="small-copy subscribe-note">{t.note}</p>
    {(state === 'invalid' || state === 'failed' || state === 'limited') && <p role="alert" className="small-copy">{t[state]}</p>}
  </form>;
}
