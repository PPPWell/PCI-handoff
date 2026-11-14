import type { CouponReport as Report } from '@/lib/coupons/types';
import { shortMenuName } from '@/lib/coupons/ux';

/** Use rate as a whole percentage; coupons claimed before the period can make it pass 100, so it is capped. */
export function rateLabel(used: number, claimed: number): string {
  return claimed ? `${Math.min(100, Math.round((used / claimed) * 100))}%` : '—';
}

/** The owner's view of the last 30 days per menu: claimed, used (lunch and dinner) and the use rate. Counts come from the database only. */
export function CouponReport({ report, restaurant }: { report: Report; restaurant?: string | null }) {
  const used = report.menus.reduce((n, m) => n + m.used, 0), claimed = report.menus.reduce((n, m) => n + m.claimed, 0);
  return (
    <section className="staff-group coupon-report" aria-labelledby="coupon-report">
      <h2 id="coupon-report">Ultimi {report.days} giorni</h2>
      {!report.menus.length ? <p className="staff-row staff-row--static"><span>Nessun coupon richiesto</span></p> : <>
        <div className="staff-kpis" role="group" aria-label={`Totale ultimi ${report.days} giorni`}>
          <p><strong>{used}</strong><span>usati</span></p>
          <p><strong>{claimed}</strong><span>richiesti</span></p>
          <p><strong>{rateLabel(used, claimed)}</strong><span>uso</span></p>
        </div>
        <ul className="staff-menus">
          {report.menus.map((m) => (
            <li key={m.campaignId} className="staff-row staff-row--split">
              <span>{shortMenuName(m.name, restaurant)}</span>
              <strong className="staff-row__value">{rateLabel(m.used, m.claimed)}</strong>
              <small>{m.used} usati su {m.claimed} richiesti · pranzo {m.usedLunch} · cena {m.usedDinner}</small>
            </li>
          ))}
        </ul>
        <p className="small-copy">«Usati» sono i coupon convalidati dallo staff, «richiesti» quelli che i clienti hanno preso; «uso» è la percentuale dei coupon usati. Pranzo = convalide prima delle 15:00 (ora italiana), cena = dalle 15:00. Si conta dall’11 novembre 2026.</p>
      </>}
    </section>
  );
}
