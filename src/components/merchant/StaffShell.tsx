import Link from 'next/link';
import {redirect} from 'next/navigation';
import {SignOut} from '@/components/account/SignOut';

/** Name of the restaurant the page is working for. */
export const restaurantName=(data:{restaurantId:string;restaurants:{id:string;name:string}[]})=>data.restaurants.find(r=>r.id===data.restaurantId)?.name??null;

type Unready='unconfigured'|'signed-out'|'not-found'|'unavailable'|'admin';

/** Staff top bar: the restaurant this phone works for and today's count, so a wrong account is visible at a glance. */
export function StaffTopbar({restaurant,today,admin=false}:{restaurant?:string|null;today?:number|null;admin?:boolean}){
 return <header className="staff-topbar">
  <span className="staff-topbar__name">{restaurant||'Area ristorante'}{admin&&<span className="staff-topbar__badge">Amministratore</span>}</span>
  {typeof today==='number'&&<span className="staff-topbar__count" aria-label={`${today} coupon convalidati oggi`}><strong>{today}</strong> oggi</span>}
 </header>;
}

const notices:Record<Exclude<Unready,'signed-out'>,{title:string;body:string}>={
 admin:{title:'Account amministratore',body:'Questo account non lavora in un locale. Se dovete aiutare un locale (convalide o annullamenti manuali), apritelo qui sotto.'},
 'not-found':{title:'Nessun locale collegato',body:'Questo account non è collegato a un locale. Chiedete al titolare di aggiungervi, oppure scriveteci.'},
 unavailable:{title:'Servizio non disponibile',body:'Non riusciamo a verificare l’accesso. Riprovate tra poco.'},
 unconfigured:{title:'Area ristorante non attiva',body:'L’area ristorante non è ancora attiva.'},
};

/** Every staff page needs a signed-in member: signed-out phones go to the login page, other states get one plain notice instead of disabled forms. */
export function MerchantUnready({kind,email,restaurants}:{kind:Unready;email?:string|null;restaurants?:{id:string;name:string}[]}){
 if(kind==='signed-out')redirect('/it/merchant/login/');
 const n=notices[kind];
 return <><StaffTopbar /><main id="main-content" className="staff-page staff-notice" lang="it" tabIndex={-1}>
  <h1>{n.title}</h1><p>{n.body}</p>
  {kind==='admin'&&restaurants&&<section className="staff-group" aria-label="Locali"><div>{restaurants.map(r=><Link className="staff-row" key={r.id} href={'/it/merchant/scan/?restaurant='+r.id}><span>{r.name}</span><small>Apri come amministratore</small></Link>)}</div></section>}
  {email&&<p className="staff-notice__email">Account: <strong>{email}</strong></p>}
  <div className="staff-notice__actions">
   {kind==='admin'&&<a className="button button--secondary staff-action" href="/zh/account/admin/" target="_blank" rel="noopener">Console di amministrazione</a>}
   {kind==='unavailable'?<a className="button button--primary staff-action" href="">Ricaricate la pagina</a>:kind==='not-found'||kind==='admin'?<SignOut locale="it" redirectTo="/it/merchant/login/" />:<Link className="button button--primary staff-action" href="/it/merchant/login/">Accedi</Link>}
   <a className="text-link" href="mailto:info@palazzoitaliacina.com">info@palazzoitaliacina.com</a>
  </div>
 </main></>;
}
