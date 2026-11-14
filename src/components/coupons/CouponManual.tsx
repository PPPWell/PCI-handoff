'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { parseCouponView, type CouponView } from '@/lib/coupons/types';
import { couponCopy } from '@/lib/coupons/copy';
import { formatCodeInput, staffCopy } from '@/lib/coupons/ux';
import { Icon } from '@/components/ui/Icon';
import { CouponMerchantPanel } from './CouponMerchantPanel';

/** Manual fallback: staff type the six digits under the customer's QR on the numeric keypad; the sixth digit searches. */
export function CouponManual() {
  const [code, setCode] = useState('');
  const [view, setView] = useState<CouponView | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [guard, setGuard] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef(false);
  useEffect(() => { if (typed.current && code.replace(/\D/g, '').length === 6) { typed.current = false; form.current?.requestSubmit(); } }, [code]);
  const c = couponCopy.it;

  async function lookup(e: FormEvent) {
    e.preventDefault();
    if (busy.current || guard) return;
    const digits = code.replace(/\D/g, '');
    if (!/^\d{6}$/.test(digits)) { setError('invalid_request'); return; }
    busy.current = true;
    setPending(true);
    setError('');
    setView(null);
    try {
      const r = await fetch('/api/coupons/actions/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lookup', shortCode: `${digits.slice(0, 3)}-${digits.slice(3)}` }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      const value = await r.json();
      if (!r.ok || value?.ok !== true) { setError(typeof value?.code === 'string' && Object.hasOwn(c.errors, value.code) ? value.code : 'unavailable'); return; }
      setView(parseCouponView(value));
    } catch {
      setError('unavailable');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function next() { setView(null); setCode(''); setError(''); window.setTimeout(() => input.current?.focus(), 0); }

  if (view) return <CouponMerchantPanel key={view.coupon.id} view={view} embedded onGuardChange={setGuard} onNext={next} />;
  const missing = error === 'not_found';
  return (
    <div className="staff-manual" lang="it">
      <form ref={form} className="staff-manual__form" onSubmit={lookup}>
        <label className="field" htmlFor="discount-manual-code">
          Le 6 cifre sotto il QR del cliente
          <input ref={input} id="discount-manual-code" className="manual-code-input" inputMode="numeric" pattern="[0-9]{3}-?[0-9]{3}" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" maxLength={7} placeholder="000-000" value={code} required disabled={pending || guard} aria-invalid={missing || undefined} aria-describedby="discount-manual-message" onChange={(e) => { typed.current = true; setError(''); setCode(formatCodeInput(e.target.value)); }} />
        </label>
        <button className="button button--primary staff-action" type="submit" disabled={pending || guard || code.replace(/\D/g, '').length !== 6}>{pending ? c.working : 'Cercate il coupon'}</button>
      </form>
      <div id="discount-manual-message" aria-live="polite">
        {missing && <div className="staff-verdict staff-verdict--info staff-verdict--inline" role="alert"><Icon name="alert" /><div><p className="staff-verdict__word">NON TROVATO</p><p className="staff-verdict__sub">Controllate le cifre. {staffCopy.wrongHint}</p></div></div>}
        {error && !missing && <p role="alert" className="staff-error">{c.errors[error as keyof typeof c.errors]}</p>}
      </div>
    </div>
  );
}
