"use client";
import {useState} from 'react';
import type {Locale} from '@/lib/i18n';
import type {AccountPageData} from '@/lib/auth/account';
import {groupAccountVouchers,type AccountGroup} from '@/lib/auth/account-view';
import {managementCopy} from '@/lib/management/copy';
import {accountCopy} from '@/lib/auth/copy';
export function AccountVouchers({page,locale}:{page:AccountPageData;locale:Locale}) {
 const c=accountCopy[locale],[group,setGroup]=useState<AccountGroup>('usable'),groups=groupAccountVouchers(page.orders);const format=(value:string)=>new Intl.DateTimeFormat(locale==='zh'?'zh-CN':locale==='it'?'it-IT':'en-GB',{timeZone:'Europe/Rome',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 if(page.orders.length===0)return <section className="state-panel"><h2>{c.empty}</h2><p>{c.emptyHint}</p><a className="button button--secondary" href={locale==='it'?'/it/firenze/mangiare/':`/${locale}/florence/eat/`}>{c.discover}</a><a className="text-link" href={`/${locale}/support/`}>{c.support}</a></section>;
 return <section className="content-section" aria-labelledby="owned-vouchers"><h2 id="owned-vouchers">{c.title}</h2><fieldset className="account-groups"><legend className="sr-only">{c.title}</legend>{(['usable','used','inactive'] as const).map(key=><label key={key} className="checkbox-row"><input type="radio" name="account-group" value={key} checked={group===key} onChange={()=>setGroup(key)} />{c.groups[key]} ({groups[key].length})</label>)}</fieldset><p className="caption">{c.currentPage}</p>
  <div className="live-voucher-list">{groups[group].length===0&&<p role="status">{c.noGroup}</p>}{groups[group].map(({order,voucher})=><article className="state-card" key={voucher.id}><h3 lang={!order.menu.names[locale]&&order.menu.names.it?'it':undefined}>{order.menu.names[locale]??order.menu.names.it??c.menuMissing}</h3><p lang="it">{order.restaurant}</p><p>{order.menu.people} {c.people} · {c.statuses[voucher.status]}</p><p>{c.expiry}: {voucher.expiresOn}</p><p className="caption">{c.purchased}: {format(order.purchasedAt)}</p>{voucher.redeemedAt&&<p>{c.redeemed}: {format(voucher.redeemedAt)}</p>}{!voucher.usable&&<p className="small-copy">{c.notUsable}</p>}{order.voucherPath?<a href={order.voucherPath+`?lang=${locale}`} className="button button--secondary" rel="noreferrer">{c.open}</a>:<p>{c.noLink}</p>}<a className="text-link" href={`/${locale}/account/vouchers/${voucher.id}/`}>{managementCopy[locale].title}</a><p className="caption">{c.gift}</p></article>)}</div>
  {page.orders.some(o=>o.vouchers.length===0)&&<p>{c.noLink}</p>}{page.nextCursor&&<a className="text-link" href={`/${locale}/account/?before=${encodeURIComponent(page.nextCursor)}`}>{c.older}</a>}
 </section>;
}
