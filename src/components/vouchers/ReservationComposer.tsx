"use client";
import { useRef,useState,type FormEvent } from "react";
import type { Locale } from "@/lib/i18n";
import { experienceCopy } from "@/lib/vouchers/experience-copy";
import { buildReservation,type ReservationChannels,type ReservationInput,type ReservationResult } from "@/lib/vouchers/reservation";

export function ReservationComposer({locale,menu,channels,example=true}:{locale:Locale;menu:string;channels:ReservationChannels;example?:boolean}) {
  const c=experienceCopy[locale].composer;
  const [input,setInput]=useState<ReservationInput>({date:"",time:"",people:2,name:"",menu,example}),[result,setResult]=useState<ReservationResult|null>(null),[copyState,setCopyState]=useState<""|"copied"|"failed">("");
  const text=useRef<HTMLTextAreaElement>(null);
  function change(values:Partial<ReservationInput>) {setInput(previous=>({...previous,...values}));setResult(null);setCopyState("");}
  function generate(event:FormEvent<HTMLFormElement>) {event.preventDefault();setCopyState("");setResult(buildReservation(input,channels));}
  async function copy() {if(!result?.ok)return;try{await navigator.clipboard.writeText(result.message);setCopyState("copied");}catch{setCopyState("failed");text.current?.focus();text.current?.select();}}
  return <section id="reservation-composer" className="content-section" aria-labelledby="reservation-title"><h2 id="reservation-title">{experienceCopy[locale].booking}</h2><p className="small-copy">{c.timezone}</p><p id="reservation-privacy" className="small-copy">{c.privacy}</p>{example&&<p className="caption">{c.example}</p>}
    <form onSubmit={generate} aria-describedby="reservation-privacy" className="reservation-form"><div className="reservation-inputs"><label className="field" htmlFor="booking-date">{c.date}<input id="booking-date" type="date" required value={input.date} onChange={event=>change({date:event.target.value})} /></label><label className="field" htmlFor="booking-time">{c.time}<input id="booking-time" type="time" required value={input.time} onChange={event=>change({time:event.target.value})} /></label><label className="field" htmlFor="booking-people">{c.people}<input id="booking-people" type="number" min="1" max="100" step="1" required value={input.people||""} onChange={event=>change({people:Number(event.target.value)})} /></label><label className="field" htmlFor="booking-name">{c.name}<input id="booking-name" type="text" required maxLength={100} autoComplete="off" value={input.name} onChange={event=>change({name:event.target.value})} /></label></div><button type="submit" className="button button--secondary">{c.generate}</button></form>
    {result&&!result.ok&&<p className="field-error" role="alert">{c.error}</p>}
    {result?.ok&&<div className="reservation-result"><label className="field" htmlFor="booking-message">{c.message}<textarea ref={text} id="booking-message" readOnly rows={7} lang="it" value={result.message} /></label><div className="state-actions"><button type="button" className="button button--primary" onClick={copy}>{c.copy}</button>{result.whatsapp&&<a className="button button--secondary" href={result.whatsapp} rel="noreferrer noopener">{c.sendWhatsapp}</a>}{result.email&&<a className="button button--secondary" href={result.email} rel="noreferrer">{c.sendEmail}</a>}</div><p role="status">{copyState==="copied"?c.copied:copyState==="failed"?c.copyFailed:""}</p></div>}
  </section>;
}
