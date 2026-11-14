'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CouponView } from '@/lib/coupons/types';
import { parseCouponView } from '@/lib/coupons/types';
import { initialCouponFlow, couponFlowReducer, couponMutation } from '@/lib/coupons/flow';
import { couponCopy } from '@/lib/coupons/copy';
import { discountAmount, formatDay, formatRomeTime, frozenMealWindows, mealWindowNow, romeClockSeconds, spacedCode, staffCopy, staffWindowLine } from '@/lib/coupons/ux';
import { Icon, type IconName } from '@/components/ui/Icon';

type Tone = 'ok' | 'late' | 'used' | 'expired' | 'stop' | 'done' | 'undone';
const toneIcon: Record<Tone, IconName> = { ok: 'check', done: 'check', late: 'alert', used: 'close', expired: 'close', stop: 'close', undone: 'arrow' };
const AUTO_BACK_S = 8;

/** Staff view of one coupon: a coloured verdict band with one big word, the amount, then details; the one action is pinned to the thumb area. Always Italian. */
export function CouponMerchantPanel({ view, embedded = false, preview = false, onGuardChange, onNext }: { view: CouponView; embedded?: boolean; preview?: boolean; onGuardChange?: (guard: boolean) => void; onNext?: () => void }) {
  const [state, dispatch] = useReducer(couponFlowReducer, view, initialCouponFlow);
  const [tick, setTick] = useState({ key: '', ms: 0 });
  const [auto, setAuto] = useState<{ id: string; at: number } | null>(null);
  const busy = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const verdict = useRef<HTMLElement>(null);
  const router = useRouter();
  const c = couponCopy.it;
  const coupon = state.view.coupon;
  const italian = coupon.translations.it;
  const receipt = state.view.redemption;
  const redeemedNow = !!receipt && !receipt.undoneAt;
  const query = `?restaurant=${coupon.restaurant.id}`;
  const scanHref = `/it/merchant/scan/${query}&camera=1`;

  useEffect(() => { dispatch({ type: 'read', view }); }, [view]);
  useEffect(() => { onGuardChange?.(state.pending || state.unknown); }, [state.pending, state.unknown, onGuardChange]);
  useEffect(() => { if (state.error) feedback.current?.focus(); else if (receipt) verdict.current?.focus(); }, [state.error, receipt]);
  // Seconds since this server reading arrived; a new reading starts again from zero.
  const tickKey = `${receipt?.id ?? ''}|${state.view.serverNow}`;
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setTick({ key: tickKey, ms: performance.now() - start }), 1000);
    return () => clearInterval(timer);
  }, [tickKey]);
  const elapsed = tick.key === tickKey ? tick.ms : 0;
  // Server time plus the seconds since it arrived: a wrong phone clock cannot change what staff see.
  const now = new Date(Date.parse(state.view.serverNow) + elapsed);
  // Only a redemption made on this screen sends the phone back to the camera by itself; undo stays available from Oggi on this phone.
  const autoBack = auto && redeemedNow && auto.id === receipt.id && !preview ? AUTO_BACK_S - Math.floor((now.getTime() - auto.at) / 1000) : null;
  useEffect(() => {
    if (autoBack === null || autoBack > 0) return;
    if (embedded) onNext?.(); else router.push(scanHref);
  }, [autoBack, embedded, onNext, router, scanHref]);

  async function submit(operation: 'redeem' | 'undo') {
    if (busy.current) return;
    setAuto(null);
    const body = couponMutation(state, operation, true, crypto.randomUUID());
    if (!body) return;
    const id = body.action === 'redeem' ? body.requestId : body.redemptionId;
    busy.current = true;
    dispatch({ type: 'start', operation, requestId: id });
    try {
      const response = await fetch('/api/coupons/actions/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      const raw = await response.json();
      if (!response.ok || raw?.ok !== true) {
        dispatch({ type: 'failure', code: typeof raw?.code === 'string' && Object.hasOwn(c.errors, raw.code) ? raw.code : 'unavailable' });
        router.refresh();
        return;
      }
      const next = parseCouponView(raw);
      if (next.coupon.id !== coupon.id || next.redemption?.id !== id) throw Error();
      dispatch({ type: 'success', view: next });
      if (operation === 'redeem') setAuto({ id, at: Date.parse(next.serverNow) });
      window.dispatchEvent(new Event('pci:voucher-changed'));
      // The top bar's "N oggi" is rendered on the server; refresh it after every change.
      router.refresh();
    } catch {
      dispatch({ type: 'failure', code: 'unavailable' });
    } finally {
      busy.current = false;
    }
  }

  // The times frozen on the coupon decide; staff get a warning outside them but the restaurant makes the call.
  const windowNow = coupon.status === 'unused' && !receipt ? mealWindowNow(frozenMealWindows(italian.window), now) : null;
  const mealLine = windowNow ? staffWindowLine(windowNow) : null;
  const late = !!mealLine && !mealLine.open;

  let tone: Tone;
  let word: string;
  let sub: string | null = null;
  if (redeemedNow) { tone = 'done'; word = staffCopy.doneTitle; sub = staffCopy.doneBody; }
  else if (receipt?.undoneAt) { tone = 'undone'; word = staffCopy.undoneTitle; sub = staffCopy.undoneBody; }
  else if (coupon.status === 'unused' && mealLine && !mealLine.open) { tone = 'late'; word = mealLine.word; sub = mealLine.line; }
  else if (coupon.status === 'unused') { tone = 'ok'; word = staffCopy.valid; sub = mealLine?.open ? mealLine.line : null; }
  else if (coupon.status === 'used') { tone = 'used'; word = staffCopy.used; sub = coupon.redeemedAt ? `${staffCopy.usedAt} ${formatRomeTime(coupon.redeemedAt, 'it')}` : null; }
  else if (coupon.status === 'expired') { tone = 'expired'; word = staffCopy.expired; sub = `${staffCopy.validUntil} ${formatDay(coupon.expiresOn, 'it')}`; }
  else { tone = 'stop'; word = staffCopy.unavailable; sub = staffCopy.wrongHint; }

  // A preview sits inside the demo page's own <main>, so it brings none.
  const Container = embedded || preview ? 'section' : 'main';
  const Heading = embedded ? 'h3' : preview ? 'h2' : 'h1';
  const canRedeem = coupon.status === 'unused' && !state.unknown && !redeemedNow;
  const finished = redeemedNow || coupon.status !== 'unused' || !!receipt?.undoneAt;
  const back = (label: string, primary: boolean) => embedded
    ? <button type="button" className={`button ${primary ? 'button--primary' : 'button--secondary'} staff-action`} disabled={state.pending} onClick={onNext}>{embedded && primary ? staffCopy.lookupNext : label}</button>
    : <Link className={`button ${primary ? 'button--primary' : 'button--secondary'} staff-action`} href={scanHref}>{label}</Link>;

  return (
    // Any touch on the result keeps it on screen: the undo button must not vanish under a finger as the countdown ends.
    <Container id={embedded || preview ? undefined : 'main-content'} className={`staff-result staff-result--${tone}${embedded ? ' staff-result--embedded' : ''}`} data-layout-ok="tool page: one result column, at most 768px" lang="it" tabIndex={-1} onPointerDownCapture={() => { if (auto) setAuto(null); }}>
      <header ref={verdict} tabIndex={-1} className={`staff-verdict staff-verdict--${tone}`} role="status" aria-live="polite">
        <Icon name={toneIcon[tone]} />
        <div>
          <Heading className="staff-verdict__word">{word}</Heading>
          {sub && <p className="staff-verdict__sub">{sub}</p>}
        </div>
      </header>

      {redeemedNow && (
        <p className="staff-clock" aria-live="off">
          <span>{staffCopy.doneAt} {romeClockSeconds(new Date(receipt.redeemedAt))}</span>
          <span>{staffCopy.liveClock} <strong>{romeClockSeconds(now)}</strong></span>
        </p>
      )}

      <section className={`staff-card staff-card--${tone === 'done' ? 'ok staff-card--done' : tone}`} aria-label="Dettagli del coupon">
        <p className="staff-card__value">{discountAmount(coupon.discountCents).replace('−', '− ')}</p>
        <p className="staff-card__name">{italian.menu ?? staffCopy.menuLine}</p>
        {italian.pay && <p className="staff-card__pay"><span>{redeemedNow ? staffCopy.collect : staffCopy.toPay}</span> {italian.list && <s>{italian.list}</s>} <strong>{italian.pay}</strong></p>}
        {late && <p className="staff-card__hint">{staffCopy.outsideHint}</p>}
        {italian.window && <p className="staff-card__meta"><strong>{staffCopy.window}</strong> {italian.window}</p>}
        {coupon.shortCode && <p className="staff-card__code"><span>{staffCopy.code}</span> <strong>{spacedCode(coupon.shortCode)}</strong> <span>· {staffCopy.expires} {formatDay(coupon.expiresOn, 'it')}</span></p>}
        {italian.conditions && <details className="staff-card__menu"><summary>{staffCopy.details}</summary><p>{italian.conditions}</p></details>}
      </section>

      <div ref={feedback} tabIndex={-1} className="staff-feedback">
        {state.error && <p role="alert">{c.errors[state.error as keyof typeof c.errors]}</p>}
        {state.unknown && <p role="status">{staffCopy.retry}</p>}
      </div>

      {(canRedeem || state.unknown) && <div className="staff-decide">
        {canRedeem && <button type="button" className={`button ${late ? 'button--secondary' : 'button--primary'} staff-action`} disabled={state.pending} onClick={() => submit('redeem')}>{state.pending ? c.working : late ? staffCopy.redeemAnyway : staffCopy.redeem}</button>}
        {canRedeem && (embedded
          ? <button type="button" className="button button--quiet staff-action" disabled={state.pending} onClick={onNext}>{staffCopy.cancel}</button>
          : <Link className="button button--quiet staff-action" href={scanHref}>{staffCopy.cancel}</Link>)}
        {state.unknown && <button className="button button--primary staff-action" disabled={state.pending} type="button" onClick={() => submit(state.operation!)}>{state.pending ? c.working : staffCopy.retryButton}</button>}
      </div>}

      {finished && !state.unknown && (
        <div className="staff-decide staff-next">
          {back(redeemedNow || receipt?.undoneAt ? staffCopy.scanNext : staffCopy.scanBack, true)}
          {autoBack !== null && autoBack > 0 && <p className="staff-auto" aria-live="off">{staffCopy.autoBack(autoBack)} · <button type="button" className="text-link" onClick={() => setAuto(null)}>{staffCopy.stay}</button></p>}
        </div>
      )}
    </Container>
  );
}

/** A staff phone scanned a coupon of another restaurant: say so plainly instead of showing the customer page. */
export function StaffOtherRestaurant({ restaurant, scanHref = '/it/merchant/scan/?camera=1', customerHref, preview = false }: { restaurant: string; scanHref?: string; customerHref?: string; preview?: boolean }) {
  const Container = preview ? 'section' : 'main', Heading = preview ? 'h2' : 'h1';
  return (
    <Container id={preview ? undefined : 'main-content'} className="staff-result staff-result--stop" lang="it" tabIndex={-1}>
      <header className="staff-verdict staff-verdict--stop" role="status">
        <Icon name="close" />
        <div><Heading className="staff-verdict__word">{staffCopy.otherTitle}</Heading><p className="staff-verdict__sub">{staffCopy.otherBody(restaurant)}</p></div>
      </header>
      <div className="staff-decide staff-next"><Link className="button button--primary staff-action" href={scanHref}>{staffCopy.scanBack}</Link>{customerHref && <a className="button button--quiet staff-action" href={customerHref} rel="noreferrer">È il vostro coupon personale? Apritelo</a>}</div>
    </Container>
  );
}
