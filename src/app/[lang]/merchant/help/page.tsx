import Link from 'next/link';
import {serverStaffFrame} from '@/lib/merchant/staff-server';
import {MerchantNav} from '@/components/merchant/MerchantNav';
import {Icon} from '@/components/ui/Icon';
import {MerchantUnready,StaffTopbar,restaurantName} from '@/components/merchant/StaffShell';

/** Questions staff and owners ask at the counter, answered inside the restaurant area: the area may run as an app from the
 * home screen, where a link to the guest site would leave no way back. Every answer describes what these screens do. */
const questions:{q:string;a:string;owner?:boolean}[]=[
 {q:'Come si convalida un coupon?',a:'Il cliente mostra il coupon prima di ordinare. Inquadrate il QR, oppure toccate «Inserite il codice» e scrivete le 6 cifre sotto il QR. Se compare VALIDO, controllate il menù indicato e toccate «Convalidate». Poi applicate lo sconto al conto.'},
 {q:'Per cosa vale un coupon?',a:'Solo per il menù scritto sul coupon, una sola volta, entro la data di scadenza (ora italiana). Il cliente paga il conto al ristorante come sempre: il coupon indica solo lo sconto da applicare.'},
 {q:'Il cliente arriva fuori dall’orario del menù',a:'Decidete voi: se lo accettate, toccate «Convalidate comunque».'},
 {q:'Ho convalidato per errore',a:'La convalida è definitiva e non si può annullare dall’app. Controllate sempre il menù e il codice prima di convalidare; se è successo un errore, scriveteci e lo correggiamo noi.'},
 {q:'Lo schermo dice che il coupon non è valido',a:'La schermata dice il motivo: «GIÀ USATO» (con data e ora della convalida), «SCADUTO», «ALTRO LOCALE» oppure «NON DISPONIBILE». In questi casi lo sconto non si applica. Se il cliente insiste, scriveteci con il codice di 6 cifre.'},
 {q:'La fotocamera non si apre',a:'Consentite la fotocamera nelle impostazioni del browser (le istruzioni sono nella schermata di scansione), oppure usate «Inserite il codice»: le 6 cifre bastano.'},
 {q:'Come aggiungo o tolgo lo staff?',a:'La persona accede prima una volta all’area ristorante con la propria email. Poi, in «Locale» → Staff, scrivete la sua email e toccate «Aggiungete». «Rimuovete» toglie l’accesso subito.',owner:true},
 {q:'Un telefono è stato perso o cambiato',a:'In «Locale» → «Telefoni collegati» vedete i telefoni che possono convalidare e potete scollegarli.',owner:true},
 {q:'Cambia il titolare o l’email del locale',a:'Scriveteci da un indirizzo del locale indicando la nuova email. Il nuovo titolare accede prima una volta all’area ristorante con quella email; poi trasferiamo il locale e il titolare precedente perde l’accesso.',owner:true},
];

export default async function MerchantHelp({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,restaurant=typeof params.restaurant==='string'?params.restaurant:undefined;
 const frame=await serverStaffFrame(restaurant);
 if(frame.state.kind!=='found')return <MerchantUnready {...frame.state} />;
 const data=frame.state.data,owner=frame.role==='owner'||frame.admin,query='?restaurant='+data.restaurantId;
 return <><StaffTopbar restaurant={restaurantName(data)} today={frame.today} admin={frame.admin} /><main id="main-content" className="staff-page staff-help" lang="it" tabIndex={-1}>
  <h1>Domande frequenti</h1>
  <div className="staff-faq">{questions.filter(item=>owner||!item.owner).map(item=><details className="faq-item" key={item.q}><summary>{item.q}<Icon name="chevron" /></summary><p>{item.a}</p></details>)}</div>
  <section className="staff-group" aria-labelledby="help-more">
   <h2 id="help-more">Altro</h2>
   <Link className="staff-row" href={'/it/merchant/scan/'+query+'&guide=1'}><span>Guida rapida</span><small>Riguardatela passo per passo</small></Link>
   <a className="staff-row" href="mailto:info@palazzoitaliacina.com"><span>Scriveteci</span><small>info@palazzoitaliacina.com</small></a>
  </section>
 </main><MerchantNav restaurantId={data.restaurantId} owner={frame.role==='owner'} /></>;
}
