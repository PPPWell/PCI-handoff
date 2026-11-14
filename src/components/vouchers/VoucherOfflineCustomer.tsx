"use client";
import {useCallback,useEffect,useState,useRef,type ReactNode,type MouseEvent} from 'react';
import type {Locale} from '@/lib/i18n';
import {offlineCopy,compareOfflineTimes,createOfflineClock,parseOfflineSnapshot,renderOfflineBody,type OfflineSnapshot} from '@/lib/vouchers/offline-core';
import {offlineMessage,type OfflineReply} from '@/lib/vouchers/offline-browser';
import {usePinSession} from './PinSessionProvider';
export function offlinePresentationBlocked(flow:{pending:boolean;unknown:boolean;batch:{serverNow:string;undoneAt:string|null}|null},stamp:string){return flow.pending||flow.unknown||Boolean(flow.batch&&!flow.batch.undoneAt&&compareOfflineTimes(stamp,flow.batch.serverNow)<=0);}
export function offlineReplySnapshot(reply:OfflineReply):OfflineSnapshot|null{if(!reply.ok||!['saved','stale'].includes(reply.status)||reply.clockTrusted===false)return null;try{return parseOfflineSnapshot(reply.snapshot);}catch{return null;}}
export function VoucherOfflineCustomer({snapshot,locale,children}:{snapshot:OfflineSnapshot;locale:Locale;children?:ReactNode}){
 const offlineMain=useRef<HTMLElement>(null),requestSequence=useRef(0),[pin]=usePinSession(),pinBlocked=offlinePresentationBlocked(pin,snapshot.savedAt),c=offlineCopy[locale];
 const [stored,setStored]=useState<OfflineSnapshot|null>(null),[storedNow,setStoredNow]=useState(0),[now,setNow]=useState(()=>Date.parse(snapshot.savedAt));
 const [stamp,setStamp]=useState(snapshot.savedAt),[phase,setPhase]=useState<'online'|'offline'|'checking'>('online'),[status,setStatus]=useState('checking');
 if(stamp!==snapshot.savedAt){setStamp(snapshot.savedAt);setPhase(typeof navigator==='undefined'||navigator.onLine?'online':'offline');}
 const accept=useCallback((reply:OfflineReply)=>{const next=offlineReplySnapshot(reply);setStored(old=>next&&old&&compareOfflineTimes(next.savedAt,old.savedAt)<0?old:next);setStoredNow(old=>Number.isFinite(reply.now)?Math.max(old,reply.now!):old);setStatus(reply.clockTrusted===false?'expired':reply.status);},[]);
 const send=useCallback(async(body:Record<string,unknown>,register=true)=>{const sequence=++requestSequence.current,reply=await offlineMessage(body,register);if(sequence===requestSequence.current)accept(reply);return reply;},[accept]);
 const clockBase=Math.max(Date.parse(snapshot.savedAt),storedNow);
 useEffect(()=>{const clock=createOfflineClock(clockBase,Date.now(),performance.now()),tick=()=>setNow(clock(Date.now(),performance.now()));queueMicrotask(tick);const timer=setInterval(tick,1000);return ()=>clearInterval(timer);},[clockBase]);
 useEffect(()=>{
  let stopped=false;const read=()=>{if(!stopped)void send({type:'read'},false);};
  const lost=()=>{for(const dialog of document.querySelectorAll<HTMLDialogElement>('.voucher-qr-dialog[open]'))dialog.close();setStored(null);setPhase('offline');read();},back=()=>{setPhase(p=>p==='online'?p:'checking');read();};
  const changed=(event:MessageEvent)=>{if(event.data?.type!=='pci-voucher-cache-changed'||!event.source||!('scriptURL' in event.source)||new URL(String(event.source.scriptURL)).pathname!=='/v/offline-worker.js')return;read();if(navigator.onLine)window.dispatchEvent(new Event('pci:voucher-changed'));};
  const focus=()=>{if(!navigator.onLine)read();};const timer=setInterval(focus,5000);window.addEventListener('offline',lost);window.addEventListener('online',back);window.addEventListener('focus',focus);navigator.serviceWorker?.addEventListener('message',changed);if(!navigator.onLine)queueMicrotask(lost);
  return ()=>{stopped=true;clearInterval(timer);window.removeEventListener('offline',lost);window.removeEventListener('online',back);window.removeEventListener('focus',focus);navigator.serviceWorker?.removeEventListener('message',changed);};
 },[send]);
 useEffect(()=>{const body=pinBlocked?{type:'block',after:pin.batch&&compareOfflineTimes(pin.batch.serverNow,snapshot.savedAt)>0?pin.batch.serverNow:snapshot.savedAt}:{type:'save',snapshot};void send(body);},[snapshot,pinBlocked,pin.batch,send]);
 useEffect(()=>{if(phase!=='online')offlineMain.current?.focus();},[phase]);
 async function clear(){setStored(null);setStatus('checking');await send({type:'clear'},false);}
 async function save(){if(pinBlocked)return;setStatus('checking');await send({type:'save',snapshot,force:true});}
 function retry(){setPhase('checking');window.dispatchEvent(new Event('pci:voucher-changed'));}
 function offlineClick(event:MouseEvent<HTMLDivElement>){const button=(event.target as HTMLElement).closest('button');if(button?.hasAttribute('data-offline-clear'))void clear();else if(button?.hasAttribute('data-offline-retry'))retry();}
 const offline=phase!=='online',newer=stored&&compareOfflineTimes(stored.savedAt,snapshot.savedAt)>0,blocked=pinBlocked||Boolean(newer)||status==='revoked'||status==='blocked';
 const masked=(pinBlocked||status==='blocked'||status==='revoked')&&stored?{...stored,qrDataUrl:null,vouchers:stored.vouchers.map(v=>({...v,shortCode:null}))}:stored;
 const feedback=status==='saved'?c.stored:status==='stale'?(offline?c.stored:c.checking):status==='paused'?c.paused:status==='cleared'?c.cleared:status==='blocked'?c.pending:status==='checking'?c.checking:status==='expired'||status==='revoked'?c.expired:c.storageFailed;
 return <>{offline&&<main ref={offlineMain} id="main-content" className="content-page container live-voucher-page offline-voucher" tabIndex={-1}>{pinBlocked&&<p role="status">{c.pending}</p>}<div onClick={offlineClick} dangerouslySetInnerHTML={{__html:renderOfflineBody(masked,locale,now)}} /><p role="status">{phase==='checking'?c.checking:feedback}</p></main>}<div hidden={offline} className={blocked?'offline-safety-block':undefined}>{children}</div>{!offline&&<section className="container content-section live-voucher-page" aria-label={c.title}><h2>{c.title}</h2><p>{c.private}</p><p role="status">{feedback}</p><div className="state-actions"><button className="button button--secondary" type="button" disabled={blocked||status==='checking'} onClick={save}>{c.save}</button><button className="button button--secondary" type="button" disabled={status==='checking'} onClick={clear}>{c.clear}</button></div></section>}</>;
}
export function VoucherOfflineInvalidation(){useEffect(()=>{void offlineMessage({type:'invalidate'},false);},[]);return null;}
