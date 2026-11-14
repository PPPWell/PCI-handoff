"use client";
import { showDialog, closeDialog } from "@/lib/dialog";
import {useEffect,useRef,useState} from 'react';
import {parseRestaurantQr} from '@/lib/merchant/scan';
import {cameraLease} from '@/lib/merchant/camera';
import {Icon} from '@/components/ui/Icon';
import {CouponManual} from '@/components/coupons/CouponManual';
import {MerchantWelcome,welcomed} from './MerchantWelcome';

type CameraState='starting'|'live'|'off'|'denied';
type TorchTrack=MediaStreamTrack;

/** Full-screen scanner: the camera opens by itself, a code is read on the phone only, then the coupon opens. Typing the code is one tap away. */
export function MerchantCamera({origin,enabled,openCode=false,restaurantId,welcome=false}:{origin:string;enabled:boolean;openCode?:boolean;restaurantId?:string;welcome?:boolean}){
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),stopRef=useRef<()=>void>(()=>{}),track=useRef<TorchTrack|null>(null),sheet=useRef<HTMLDialogElement>(null);
 const [state,setState]=useState<CameraState>('off'),[greet,setGreet]=useState(false),[hint,setHint]=useState(''),[found,setFound]=useState(false),[torch,setTorch]=useState<boolean|null>(null),[online,setOnline]=useState(true);

 function stop(){stopRef.current();stopRef.current=()=>{};track.current=null;setTorch(null);if(video.current)video.current.srcObject=null;}
 function open(value:string){const scanned=parseRestaurantQr(value.trim(),origin);
  if(!scanned){setHint('Questo QR non è un coupon di Palazzo Italia-Cina.');return false;}
  setFound(true);navigator.vibrate?.(40);stop();
  window.location.assign(scanned.kind==='coupon'?`/c/${scanned.token}/?lang=it`:`/it/merchant/voucher/${scanned.token}/`);return true;}
 function start(){if(!enabled)return;stop();setHint('');setState('starting');let frame:ReturnType<typeof setTimeout>|undefined,last='';
  const release=cameraLease(()=>navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280}}}),async(stream,isActive)=>{
   const {default:decode}=await import('jsqr');if(!isActive())return;const element=video.current,surface=canvas.current;if(!element||!surface)throw Error();
   element.srcObject=stream;await element.play();if(!isActive())return;
   const t=stream.getVideoTracks()[0] as TorchTrack|undefined;track.current=t??null;setTorch((t?.getCapabilities?.() as {torch?:boolean}|undefined)?.torch?false:null);setState('live');
   const context=surface.getContext('2d',{willReadFrequently:true});if(!context)throw Error();
   function read(){if(!isActive())return;try{if(element!.readyState>=2&&element!.videoWidth){const ratio=Math.min(1,800/element!.videoWidth);surface!.width=Math.round(element!.videoWidth*ratio);surface!.height=Math.round(element!.videoHeight*ratio);context!.drawImage(element!,0,0,surface!.width,surface!.height);const pixels=context!.getImageData(0,0,surface!.width,surface!.height),code=decode(pixels.data,pixels.width,pixels.height);
     // A wrong QR keeps the camera running; the same wrong code is not reported twice in a row.
     if(code&&code.data!==last){last=code.data;if(open(code.data))return;}}frame=setTimeout(read,200);}catch{stop();setState('off');setHint('Fotocamera non disponibile. Inserite il codice a mano.');}}
   read();
  },()=>{setState('denied');});
  stopRef.current=()=>{release();if(frame)clearTimeout(frame);};}
 async function toggleTorch(){const t=track.current;if(!t||torch===null)return;try{await t.applyConstraints({advanced:[{torch:!torch} as MediaTrackConstraintSet]});setTorch(!torch);}catch{setTorch(null);}}
 function openSheet(){stop();setState('off');const d=sheet.current;if(!d)return;showDialog(d);d.querySelector<HTMLInputElement>('#discount-manual-code')?.focus();}
 function closeSheet(){closeDialog(sheet.current);}

 useEffect(()=>{
  // First visit on this phone: the welcome comes first and ends by starting the camera.
  const t=window.setTimeout(()=>{if(openCode||new URLSearchParams(window.location.search).get('code')==='1')openSheet();else if(welcome||enabled&&!welcomed())setGreet(true);else start();},0);
  const hidden=()=>{if(document.visibilityState!=='visible'){stop();setState('off');}};
  const net=()=>setOnline(navigator.onLine);net();
  document.addEventListener('visibilitychange',hidden);window.addEventListener('online',net);window.addEventListener('offline',net);
  return ()=>{window.clearTimeout(t);stopRef.current();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('online',net);window.removeEventListener('offline',net);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[enabled]);

 return <section className="scanner" data-state={state} data-found={found?'true':undefined} aria-label="Fotocamera" lang="it">
  {!online&&<p className="scanner__offline" role="alert"><Icon name="alert" /> Senza rete: annotate il codice del cliente e convalidate appena torna la connessione.</p>}
  <div className="scanner__view">
   <video ref={video} className="scanner__video" muted playsInline autoPlay aria-hidden="true" />
   <canvas ref={canvas} hidden />
   <div className="scanner__frame" aria-hidden="true"><span /><span /><span /><span /></div>
   <div className="scanner__message" aria-live="polite">
    {state==='live'&&!hint&&<p>Inquadrate il QR del cliente</p>}
    {state==='starting'&&<p>Apertura della fotocamera…</p>}
    {hint&&<p className="scanner__hint">{hint}</p>}
    {state==='denied'&&<><p><strong>La fotocamera è bloccata.</strong></p><p className="scanner__help">iPhone: Impostazioni › Safari › Fotocamera › Consenti. Android: tocca il lucchetto accanto all’indirizzo › Autorizzazioni.</p></>}
    {(state==='off'||state==='denied')&&<button type="button" className="button button--secondary scanner__start" disabled={!enabled} onClick={start}>Avviate la fotocamera</button>}
   </div>
  </div>
  <div className="scanner__controls">
   {torch!==null&&<button type="button" className="scanner__torch" aria-pressed={torch} onClick={toggleTorch}><Icon name="torch" /><span>Torcia</span></button>}
   <button type="button" className="button button--primary scanner__code" onClick={openSheet}><Icon name="keypad" /> Inserite il codice</button>
  </div>
  {greet&&<MerchantWelcome restaurantId={restaurantId} onDone={()=>{setGreet(false);start();}} onCodeOnly={()=>{setGreet(false);openSheet();}} />}
  <dialog ref={sheet} className="staff-sheet" aria-labelledby="manual-title" onClose={()=>{if(document.visibilityState==='visible')start();}}>
   <div className="staff-sheet__head"><h2 id="manual-title">Codice del coupon</h2><button type="button" className="staff-sheet__close" onClick={closeSheet} aria-label="Chiudete"><Icon name="close" /></button></div>
   <CouponManual />
  </dialog>
 </section>;
}
