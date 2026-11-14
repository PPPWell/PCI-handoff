"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {Locale} from '@/lib/i18n';
import {parsePinResult,type PinBatch,type PinResult} from '@/lib/vouchers/pin-types';
import {PinSessionProvider,usePinSession} from './PinSessionProvider';
import {pinErrors} from '@/lib/vouchers/pin-copy';
function PinUndoForm({batch,value,onChange,onSubmit,pending,blocked,unknown}:{batch:PinBatch;value:string;onChange:(v:string)=>void;onSubmit:(e:FormEvent)=>void;pending:boolean;blocked:boolean;unknown:boolean}) {
 const [remaining,setRemaining]=useState(()=>Math.max(0,Math.ceil((Date.parse(batch.undoUntil)-Date.parse(batch.serverNow))/1000)));
 useEffect(()=>{const start=performance.now();const timer=setInterval(()=>setRemaining(Math.max(0,Math.ceil((Date.parse(batch.undoUntil)-Date.parse(batch.serverNow)-(performance.now()-start))/1000))),1000);return ()=>clearInterval(timer);},[batch]);
 return <><p className="caption" aria-live="off">Tempo per annullare: {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')} · orario italiano</p>{remaining>0||unknown?<form className="reservation-form" onSubmit={onSubmit}><p>Potete annullare questo utilizzo entro due minuti. Il tempo rimasto viene verificato alla conferma.</p><label className="field" htmlFor="undo-pin">PIN del ristorante per annullare<input id="undo-pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" minLength={4} maxLength={4} required value={value} disabled={pending||blocked} onChange={e=>onChange(e.target.value.replace(/\D/g,''))} /></label><button className="button button--secondary" type="submit" disabled={pending||blocked||value.length!==4}>{pending?'Verifica in corso…':unknown?'Verificate l’annullamento':'Annullate l’utilizzo'}</button></form>:<p>Il termine per annullare è trascorso.</p>}</>;
}
interface PinProps {token:string;locale:Locale;availableIds:string[];restaurant:string;menu:string;initialBatch?:PinBatch|null}
export function PinRedemption(props:PinProps) {return <PinSessionProvider initialBatch={props.initialBatch}><PinRedemptionForm {...props} /></PinSessionProvider>;}
function PinRedemptionForm({token,locale,availableIds,restaurant,menu,initialBatch=null}:PinProps) {
 const [state,dispatch]=usePinSession(),[quantity,setQuantity]=useState(1),[pin,setPin]=useState(''),[undoPin,setUndoPin]=useState('');
 useEffect(()=>{dispatch({type:'recover',batch:initialBatch});},[dispatch,initialBatch]);
 const busy=useRef(false),resultRef=useRef<HTMLDivElement>(null),reviewRef=useRef<HTMLHeadingElement>(null);
 const batch=state.batch,selection=state.selection,activeBatch=batch&&batch.undoneAt===null;
 const format=(iso:string)=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',dateStyle:'medium',timeStyle:'medium'}).format(new Date(iso));
 useEffect(()=>{if(state.error||state.batch)resultRef.current?.focus();},[state.error,state.batch]);
 useEffect(()=>{if(selection)reviewRef.current?.focus();},[selection]);
 function review(event:FormEvent){event.preventDefault();if(quantity<1||availableIds.length===0||state.pending||state.unknown)return;setPin('');dispatch({type:'review',selection:{requestId:crypto.randomUUID(),voucherIds:availableIds.slice(0,Math.min(quantity,availableIds.length))}});}
 async function submit(event:FormEvent,operation:'redeem'|'undo') {
  event.preventDefault();const code=operation==='redeem'?pin:undoPin;
  if(busy.current||!/^\d{4}$/.test(code)||operation==='redeem'&&!selection||operation==='undo'&&!batch)return;
  busy.current=true;dispatch({type:'sending',operation});setPin('');setUndoPin('');let result:PinResult;
  try{const response=await fetch(`/api/vouchers/${encodeURIComponent(token)}/pin/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(operation==='redeem'?{action:'redeem',pin:code,requestId:selection!.requestId,voucherIds:selection!.voucherIds}:{action:'undo',pin:code,batchId:batch!.batchId}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});result=parsePinResult(await response.json());}catch{result={ok:false,code:'unavailable'};}
  busy.current=false;dispatch({type:'received',result});if(result.ok||!['incorrect_pin','invalid_pin','pin_locked','unavailable'].includes(result.code))window.dispatchEvent(new Event('pci:voucher-changed'));
 }
 return <section className="content-section pin-redemption" aria-labelledby="pin-fallback-title"><h2 id="pin-fallback-title" lang="it">Utilizzo con PIN del ristorante</h2>{locale==='zh'&&<p className="small-copy">仅供餐厅店员操作。确认本次使用张数后，由店员输入餐厅 PIN；两分钟内可用 PIN 撤销。</p>}
  <details className="faq-item" open={Boolean(batch||selection||state.error)||undefined}><summary lang="it">Staff: aprite la modalità PIN di riserva</summary><div lang="it" aria-busy={state.pending}>
   <p>Solo lo staff deve inserire il PIN. Controllate ristorante, menù e numero di voucher prima di confermare.</p>
   <div ref={resultRef} tabIndex={-1} className="pin-result">
    {state.error&&<p role="alert">{pinErrors[state.error.code]}{state.error.attemptsRemaining!==undefined&&<> Tentativi rimasti: {state.error.attemptsRemaining}.</>}{state.error.retryAt&&<> Riprovate dopo le {format(state.error.retryAt)}.</>}</p>}
    {state.unknown&&state.error?.code!=='unavailable'&&<p role="status">{pinErrors.unavailable}</p>}
    {batch&&<div role="status"><h3>{batch.undoneAt?'Utilizzo annullato':'Utilizzo registrato'}</h3><p>{batch.quantity} voucher · {format(batch.undoneAt??batch.redeemedAt)}</p></div>}
   </div>
   {activeBatch&&!state.undoClosed&&<PinUndoForm key={`${batch.batchId}-${batch.serverNow}`} batch={batch} value={undoPin} onChange={setUndoPin} onSubmit={e=>submit(e,'undo')} pending={state.pending} blocked={state.unknown&&state.operation!=='undo'} unknown={state.unknown&&state.operation==='undo'} />}
   {!selection&&<>{availableIds.length>0?<form className="reservation-form" onSubmit={review}><label className="field" htmlFor="pin-quantity">Quanti voucher utilizzate adesso?<select id="pin-quantity" value={Math.min(quantity,availableIds.length)} disabled={state.pending||state.unknown} onChange={e=>setQuantity(Number(e.target.value))}>{availableIds.map((_,index)=><option key={index+1} value={index+1}>{index+1}</option>)}</select></label><button className="button button--secondary" type="submit" disabled={state.pending||state.unknown}>Controllate la selezione</button></form>:<p>Nessun voucher disponibile per un nuovo utilizzo.</p>}</>}
   {selection&&<form className="reservation-form pin-review" onSubmit={e=>submit(e,'redeem')}><h3 ref={reviewRef} tabIndex={-1}>Confermate l’utilizzo</h3><p>{restaurant}</p><p>{menu}</p><p><strong>{selection.voucherIds.length} voucher</strong> · l’intero menù di ogni voucher sarà utilizzato.</p><label className="field" htmlFor="redeem-pin">PIN del ristorante<input id="redeem-pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" minLength={4} maxLength={4} required value={pin} disabled={state.pending||state.unknown&&state.operation!=='redeem'} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} /></label><div className="state-actions"><button type="submit" className="button button--primary" disabled={state.pending||pin.length!==4}>{state.pending?'Verifica in corso…':state.unknown?'Verificate la stessa richiesta':'Confermate l’utilizzo'}</button><button type="button" className="button button--secondary" disabled={state.pending||state.unknown} onClick={()=>{setPin('');dispatch({type:'cancel'});}}>Indietro</button></div></form>}
  </div></details>
 </section>;
}
