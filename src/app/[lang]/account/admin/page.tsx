import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {isLocale,type Locale} from '@/lib/i18n';
import {getCatalog} from '@/lib/catalog/load';
import {serverAdminOverview} from '@/lib/admin/server';
import {contentCampaigns} from '@/lib/admin/console';
import {AdminConsole} from '@/components/admin/AdminConsole';
export const dynamic='force-dynamic';
export const runtime='nodejs';

const copy={
 zh:{title:'餐厅与活动',lead:'这里列出内容里所有在售的优惠券套餐。开通会同时建好餐厅和店主账号的权限；店主登录商家端后就能扫码核销。新增餐厅或套餐，先在内容文件里加好，再回来开通。',stats:'平台统计',signIn:'请先登录。',account:'去登录',unavailable:'暂时无法读取，请稍后刷新。',empty:'内容里还没有在售的优惠券套餐。'},
 it:{title:'Ristoranti e campagne',lead:'Qui trovi tutti i menù con coupon in vendita nei contenuti. Attivandoli si creano il ristorante e i permessi del titolare, che poi convalida dall’area ristorante. Per un nuovo locale o menù, aggiungilo prima ai contenuti.',stats:'Statistiche',signIn:'Accedi prima.',account:'Accedi',unavailable:'Dati non disponibili. Riprova tra poco.',empty:'Nessun menù con coupon nei contenuti.'},
 en:{title:'Restaurants and campaigns',lead:'Every coupon menu on sale in the content is listed here. Opening one creates the restaurant and the owner’s access; the owner then redeems from the restaurant area. For a new restaurant or menu, add it to the content first.',stats:'Platform stats',signIn:'Please sign in first.',account:'Sign in',unavailable:'Unavailable right now. Please refresh shortly.',empty:'No coupon menus on sale in the content.'},
} satisfies Record<Locale,unknown>;

export async function generateMetadata({params}:{params:Promise<{lang:string}>}):Promise<Metadata>{const {lang}=await params;if(!isLocale(lang))notFound();return {title:`${copy[lang].title} | Palazzo Italia-Cina`,robots:{index:false,follow:false},referrer:'no-referrer'};}

/** Operator-only: open coupon campaigns from the content and pause or resume them. Anyone who is not a platform admin gets a plain 404. */
export default async function AdminPage({params}:{params:Promise<{lang:string}>}){
 const {lang}=await params;if(!isLocale(lang))notFound();const c=copy[lang],state=await serverAdminOverview();
 if(state.kind==='forbidden')notFound();
 const shell=(body:React.ReactNode)=><main id="main-content" className="content-page container stats-page" tabIndex={-1}><h1>{c.title}</h1>{body}</main>;
 if(state.kind==='signed-out'||state.kind==='unconfigured')return shell(<section className="state-panel"><p>{c.signIn}</p><Link className="button button--primary" href={`/${lang}/account/`}>{c.account}</Link></section>);
 if(state.kind!=='found')return shell(<section className="state-panel"><p>{c.unavailable}</p></section>);
 const campaigns=contentCampaigns(getCatalog());
 return shell(<>
  <p className="stats-lead">{c.lead}</p>
  <nav className="admin-links" aria-label={c.title}><Link className="text-link" href={`/${lang}/account/stats/`}>{c.stats}</Link></nav>
  {campaigns.length?<AdminConsole locale={lang} campaigns={campaigns} restaurants={state.restaurants} />:<p>{c.empty}</p>}
 </>);
}
