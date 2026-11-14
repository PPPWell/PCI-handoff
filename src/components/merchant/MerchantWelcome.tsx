"use client";
import { showDialog, closeDialog } from "@/lib/dialog";
import {useEffect,useRef,useState} from 'react';
import {MerchantDeviceName} from './MerchantDeviceName';

export const WELCOME_KEY='pci:merchant:welcome:v1';
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};

/** Read and write the "already welcomed" flag; blocked storage (private mode) just shows the welcome again. */
export function welcomed(){try{return window.localStorage.getItem(WELCOME_KEY)==='1';}catch{return false;}}
function remember(){try{window.localStorage.setItem(WELCOME_KEY,'1');}catch{/* storage blocked: the welcome shows again next time */}}
/** A guide opened again from the menu (?guide=1) should not reopen on refresh. */
function dropGuideParam(){const url=new URL(window.location.href);if(url.searchParams.has('guide')){url.searchParams.delete('guide');window.history.replaceState(window.history.state,'',url);}}

/** First visit on a phone, and again from Locale/Account → Guida rapida: how a coupon is validated, name the phone, add the
 * app to the home screen, then allow the camera. Every step can be skipped. */
export function MerchantWelcome({restaurantId,onDone,onCodeOnly}:{restaurantId?:string;onDone:()=>void;onCodeOnly?:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),install=useRef<InstallPrompt|null>(null);
 const [step,setStep]=useState(0),[platform,setPlatform]=useState<'ios'|'android'|'installed'|'other'>('other'),[canInstall,setCanInstall]=useState(false);
 useEffect(()=>{
  showDialog(dialog.current);
  const capture=(e:Event)=>{e.preventDefault();install.current=e as InstallPrompt;setCanInstall(true);};
  window.addEventListener('beforeinstallprompt',capture);
  const t=window.setTimeout(()=>{const ua=navigator.userAgent,standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;setPlatform(standalone?'installed':/iPhone|iPad|iPod/.test(ua)?'ios':/Android/.test(ua)?'android':'other');},0);
  return ()=>{window.removeEventListener('beforeinstallprompt',capture);window.clearTimeout(t);};
 },[]);
 const homeStep=platform==='installed'?null:2;
 function next(){setStep(s=>s===0?(restaurantId?1:homeStep??3):s===1?(homeStep??3):3);}
 function finish(){remember();dropGuideParam();closeDialog(dialog.current);onDone();}
 // Phones without a usable camera still validate by the six digits under the QR.
 function codeOnly(){remember();dropGuideParam();closeDialog(dialog.current);(onCodeOnly??onDone)();}
 async function installApp(){const p=install.current;if(!p)return;await p.prompt();install.current=null;setCanInstall(false);next();}
 return <dialog ref={dialog} className="staff-welcome" aria-labelledby="welcome-title" onCancel={e=>{e.preventDefault();finish();}} lang="it">
  <p className="staff-welcome__steps" aria-hidden="true">{[0,1,2,3].map(n=><span key={n} data-on={n<=step?'true':undefined} />)}</p>
  {step===0&&<>
   <h2 id="welcome-title">Come si convalida un coupon</h2>
   <ol className="staff-welcome__how">
    <li>Il cliente mostra il coupon prima di ordinare: <strong>inquadrate il QR</strong>, oppure toccate <strong>Inserite il codice</strong> e scrivete le 6 cifre sotto il QR.</li>
    <li>Se compare <strong>VALIDO</strong>, controllate il menù indicato e toccate <strong>Convalidate</strong>.</li>
    <li>Applicate lo sconto al conto. La convalida è definitiva: controllate menù e codice prima di convalidare. Se c’è un errore, scriveteci e lo correggiamo noi.</li>
   </ol>
   <button type="button" className="button button--primary staff-action" onClick={next}>Avanti</button>
   <button type="button" className="button button--quiet staff-action" onClick={finish}>Chiudi la guida</button>
  </>}
  {step===1&&restaurantId&&<>
   <h2 id="welcome-title">Benvenuti nell’area ristorante</h2>
   <p>Date un nome a questo telefono: il titolare lo riconosce nell’elenco dei telefoni collegati.</p>
   <MerchantDeviceName restaurantId={restaurantId} onSaved={()=>next()} />
   <button type="button" className="button button--quiet staff-action" onClick={next}>Salta</button>
  </>}
  {step===2&&<>
   <h2 id="welcome-title">Aggiungete l’app alla schermata Home</h2>
   {platform==='ios'?<ol className="staff-welcome__how"><li>Toccate <strong>Condividi</strong> in basso in Safari (il quadrato con la freccia).</li><li>Scegliete <strong>Aggiungi alla schermata Home</strong>.</li><li>Aprite l’icona <strong>Ristorante</strong>: si apre direttamente sulla scansione.</li></ol>
    :canInstall?<p>Un tocco e l’icona <strong>Ristorante</strong> sarà sulla schermata Home, pronta per scansionare.</p>
    :<ol className="staff-welcome__how"><li>Aprite il menu del browser (⋮).</li><li>Scegliete <strong>Aggiungi a schermata Home</strong> o <strong>Installa app</strong>.</li></ol>}
   {canInstall&&<button type="button" className="button button--primary staff-action" onClick={installApp}>Aggiungi alla schermata Home</button>}
   <button type="button" className={`button ${canInstall?'button--quiet':'button--primary'} staff-action`} onClick={next}>{canInstall?'Più tardi':'Fatto'}</button>
  </>}
  {step===3&&<>
   <h2 id="welcome-title">Ultimo passo: la fotocamera</h2>
   <p>Serve per leggere il QR del cliente. Il video resta su questo telefono e non viene inviato.</p>
   <button type="button" className="button button--primary staff-action" onClick={finish}>Consenti la fotocamera</button>
   <button type="button" className="button button--quiet staff-action" onClick={codeOnly}>Usate solo il codice a 6 cifre</button>
  </>}
 </dialog>;
}
