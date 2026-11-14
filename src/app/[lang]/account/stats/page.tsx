import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {isLocale,type Locale} from '@/lib/i18n';
import {serverPlatformReport,serverChannelReport} from '@/lib/admin/server';
import {platformTotals,reportDays,consentRate} from '@/lib/admin/report';
import {StatsExport} from '@/components/admin/StatsExport';
export const dynamic='force-dynamic';
export const runtime='nodejs';

const copy={
 zh:{title:'平台统计',lead:'数字直接来自数据库，从 2026 年 11 月 11 日 0:00（意大利时间）起统计，测试账号不计。已核销以店员核销为准；注册用户只算顾客，不含商家和管理员账号。',days:(n:number)=>`近 ${n} 天`,users:'注册用户',claimed:'已领券',used:'已核销',rate:'核销率',today:'今天',period:(n:number)=>`近 ${n} 天`,total:'累计',restaurant:'餐厅',none:'还没有餐厅。',signIn:'请先登录。',account:'去登录',unavailable:'暂时无法读取统计，请稍后刷新。',asOf:(d:string)=>`统计日期：${d}（意大利时间）`,export:'导出 CSV',admin:'餐厅与活动',channels:'海报渠道',channelsLead:'扫码 = 扫海报二维码的次数（不含爬虫）；领券、核销 = 带这个渠道的券。',channel:'渠道',scans:'扫码',consentTitle:'Cookie 同意率',consentNote:(a:number,r:number)=>`接受 ${a} · 拒绝 ${r}`,noChannels:'这段时间没有渠道数据。'},
 it:{title:'Statistiche',lead:'Dati presi dal database, dal 11 novembre 2026 alle 00:00 (ora italiana); gli account di prova non sono inclusi. Contano le convalide dello staff; gli utenti registrati sono solo clienti, senza account di ristoranti e amministratori.',days:(n:number)=>`Ultimi ${n} giorni`,users:'Utenti registrati',claimed:'Coupon richiesti',used:'Coupon usati',rate:'Tasso d’uso',today:'Oggi',period:(n:number)=>`${n} giorni`,total:'Totale',restaurant:'Ristorante',none:'Nessun ristorante.',signIn:'Accedi prima.',account:'Accedi',unavailable:'Statistiche non disponibili. Riprova tra poco.',asOf:(d:string)=>`Data: ${d} (ora italiana)`,export:'Esporta CSV',admin:'Ristoranti e campagne',channels:'Canali dei poster',channelsLead:'Scansioni = volte in cui è stato scansionato il QR (senza crawler); richiesti e usati = coupon con quel canale.',channel:'Canale',scans:'Scansioni',consentTitle:'Consenso ai cookie',consentNote:(a:number,r:number)=>`Accettati ${a} · rifiutati ${r}`,noChannels:'Nessun dato di canale in questo periodo.'},
 en:{title:'Platform stats',lead:'Straight from the database, counted from 11 November 2026 00:00 Italian time; test accounts are left out. A coupon counts as used when staff redeem it; registered users are customers only, without restaurant and admin accounts.',days:(n:number)=>`Last ${n} days`,users:'Registered users',claimed:'Coupons claimed',used:'Coupons used',rate:'Use rate',today:'Today',period:(n:number)=>`${n} days`,total:'All time',restaurant:'Restaurant',none:'No restaurants yet.',signIn:'Please sign in first.',account:'Sign in',unavailable:'Stats are unavailable right now. Please refresh shortly.',asOf:(d:string)=>`Date: ${d} (Italian time)`,export:'Export CSV',admin:'Restaurants and campaigns',channels:'Poster channels',channelsLead:'Scans = times a poster QR was scanned (crawlers excluded); claimed and used = coupons carrying that channel.',channel:'Channel',scans:'Scans',consentTitle:'Cookie consent',consentNote:(a:number,r:number)=>`Accepted ${a} · rejected ${r}`,noChannels:'No channel data in this period.'},
} satisfies Record<Locale,unknown>;

export async function generateMetadata({params}:{params:Promise<{lang:string}>}):Promise<Metadata>{const {lang}=await params;if(!isLocale(lang))notFound();return {title:`${copy[lang].title} | Palazzo Italia-Cina`,robots:{index:false,follow:false},referrer:'no-referrer'};}

/** Operator-only numbers: sign-ups, coupons claimed and used per restaurant. Anyone who is not a platform admin gets a plain 404. */
export default async function PlatformStatsPage({params,searchParams}:{params:Promise<{lang:string}>;searchParams:Promise<{days?:string|string[]}>}){
 const {lang}=await params;if(!isLocale(lang))notFound();const c=copy[lang],search=await searchParams;
 const days=reportDays.find(n=>String(n)===search.days)??30,[state,channelReport]=await Promise.all([serverPlatformReport(days),serverChannelReport(days)]);
 if(state.kind==='forbidden')notFound();
 const shell=(body:React.ReactNode)=><main id="main-content" className="content-page container stats-page" tabIndex={-1}><h1>{c.title}</h1>{body}</main>;
 if(state.kind==='signed-out'||state.kind==='unconfigured')return shell(<section className="state-panel"><p>{c.signIn}</p><Link className="button button--primary" href={`/${lang}/account/`}>{c.account}</Link></section>);
 if(state.kind!=='found')return shell(<section className="state-panel"><p>{c.unavailable}</p></section>);
 const {report}=state,totals=platformTotals(report),pair=(claimed:number,used:number)=><>{claimed} <span className="stats-sep">/</span> {used}</>;
 return shell(<>
  <p className="stats-lead">{c.lead} {c.asOf(report.date)}</p>
  <nav className="filter-chips stats-days" aria-label={c.days(days)}>{reportDays.map(n=><Link key={n} aria-current={n===days?'page':undefined} href={`?days=${n}`}>{c.days(n)}</Link>)}</nav>
  <dl className="stats-summary">
   <div><dt>{c.users}</dt><dd>{report.users.total}</dd><dd className="stats-note">{c.period(days)} +{report.users.period} · {c.today} +{report.users.today}</dd></div>
   <div><dt>{c.claimed}</dt><dd>{totals.claimed}</dd><dd className="stats-note">{c.period(days)} {totals.claimedPeriod} · {c.today} {totals.claimedToday}</dd></div>
   <div><dt>{c.used}</dt><dd>{totals.used}</dd><dd className="stats-note">{c.period(days)} {totals.usedPeriod} · {c.today} {totals.usedToday}</dd></div>
   <div><dt>{c.rate}</dt><dd>{totals.rate===null?'—':`${Math.round(totals.rate*100)}%`}</dd></div>
  </dl>
  {report.restaurants.length?<div className="stats-table-wrap"><table className="stats-table">
   <caption>{c.claimed} / {c.used}</caption>
   <thead><tr><th scope="col">{c.restaurant}</th><th scope="col">{c.today}</th><th scope="col">{c.period(days)}</th><th scope="col">{c.total}</th></tr></thead>
   <tbody>{report.restaurants.map(r=><tr key={r.restaurantId}><th scope="row" lang="it">{r.name}</th><td>{pair(r.claimedToday,r.usedToday)}</td><td>{pair(r.claimedPeriod,r.usedPeriod)}</td><td>{pair(r.claimed,r.used)}</td></tr>)}</tbody>
  </table></div>:<p>{c.none}</p>}
  {channelReport&&<section aria-labelledby="stats-channels"><h2 id="stats-channels">{c.channels}</h2><p className="stats-lead">{c.channelsLead}</p>
   {channelReport.channels.length?<div className="stats-table-wrap"><table className="stats-table">
    <thead><tr><th scope="col">{c.channel}</th><th scope="col">{c.scans}</th><th scope="col">{c.claimed}</th><th scope="col">{c.used}</th></tr></thead>
    <tbody>{channelReport.channels.map(r=><tr key={r.channel}><th scope="row">{r.channel}</th><td>{r.scans}</td><td>{r.claimed}</td><td>{r.used}</td></tr>)}</tbody>
   </table></div>:<p>{c.noChannels}</p>}
   <dl className="stats-summary"><div><dt>{c.consentTitle}</dt><dd>{consentRate(channelReport.consent)===null?'—':`${Math.round(consentRate(channelReport.consent)!*100)}%`}</dd><dd className="stats-note">{c.consentNote(channelReport.consent.accept,channelReport.consent.reject)}</dd></div></dl>
  </section>}
  <div className="state-actions"><StatsExport report={report} label={c.export} /><Link className="button button--secondary" href={`/${lang}/account/admin/`}>{c.admin}</Link></div>
 </>);
}
