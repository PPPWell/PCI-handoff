import Link from 'next/link';
import type { CouponHistory as History, CouponReport } from '@/lib/coupons/types';
import { shortMenuName } from '@/lib/coupons/ux';
import { todayTotal } from '@/lib/merchant/today';

const time = (iso: string) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
/** "2026-11-06" → "venerdì 6 novembre". */
export const longDay = (day: string) => new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00Z`));

/** Today at a glance: one big number, lunch and dinner, then each menu. Counts come from the database; undone redemptions are not counted. */
export function CouponToday({ report, restaurant }: { report: CouponReport; restaurant?: string | null }) {
  const total = todayTotal(report), lunch = report.menus.reduce((n, m) => n + m.todayLunch, 0), dinner = total - lunch;
  const menus = report.menus.filter((m) => m.todayLunch + m.todayDinner > 0);
  return (
    <section className="staff-today-sum" aria-label="Riepilogo di oggi">
      <p className="staff-today-sum__total"><strong>{total}</strong> <span>{total === 1 ? 'coupon convalidato' : 'coupon convalidati'}</span></p>
      <p className="staff-today-sum__split"><span>Pranzo <strong>{lunch}</strong></span><span>Cena <strong>{dinner}</strong></span></p>
      {menus.length > 0 && <ul className="staff-today-sum__menus">{menus.map((m) => <li key={m.campaignId}>{shortMenuName(m.name, restaurant)} <strong>{m.todayLunch + m.todayDinner}</strong></li>)}</ul>}
    </section>
  );
}

/** Today's redemptions, newest first. A redemption is final: there is no undo; records undone before that was removed still show as undone. */
export function CouponHistory({ history, restaurant }: { history: History; restaurant?: string | null; now?: string }) {
  return (
    <section className="staff-log" aria-labelledby="discount-history-title">
      <h2 id="discount-history-title">Convalide</h2>
      {history.records.length ? (
        <ol className="staff-log__list">
          {history.records.map((row) => {
            return (
              <li key={row.id} className="staff-log__row" data-undone={row.undoneAt ? 'true' : undefined}>
                <time dateTime={row.redeemedAt}>{time(row.redeemedAt)}</time>
                <span className="staff-log__menu">{shortMenuName(row.name, restaurant)}</span>
                <span className="staff-log__code" aria-label={`Codice ${row.shortCode}`}>··{row.shortCode.slice(-3)}</span>
                {row.undoneAt ? <span className="staff-log__status">Annullata alle {time(row.undoneAt)}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="staff-log__empty">Nessun coupon convalidato oggi.</p>}
      {history.nextCursor && <Link className="button button--secondary staff-log__more" href={'/it/merchant/today/?' + new URLSearchParams({ restaurant: history.restaurantId, couponAt: history.nextCursor.at, couponId: history.nextCursor.id }).toString()}>Convalide precedenti</Link>}
    </section>
  );
}
