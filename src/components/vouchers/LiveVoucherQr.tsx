"use client";
import { showDialog, closeDialog } from "@/lib/dialog";
import Image from "next/image";
import { useRef } from "react";
import type { Locale } from "@/lib/i18n";
import { liveVoucherCopy } from "@/lib/vouchers/live-copy";
export function LiveVoucherQr({dataUrl,token,locale,namespace='v'}:{dataUrl:string;token:string;locale:Locale;namespace?:'v'|'c'}) {
  const c=liveVoucherCopy[locale],dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement>(null),close=useRef<HTMLButtonElement>(null);
  return <div className="live-qr"><Image src={dataUrl} alt={c.qr} width={384} height={384} unoptimized priority /><div className="state-actions"><button ref={opener} className="button button--primary" type="button" onClick={()=>{showDialog(dialog.current);close.current?.focus();}}>{c.fullscreen}</button><a className="button button--secondary" href={`/${namespace}/${encodeURIComponent(token)}/qr.png/?download=1`} download rel="noreferrer">{c.save}</a></div><p className="small-copy">{c.savedNotice}</p>
    <dialog ref={dialog} className="voucher-qr-dialog" aria-labelledby="large-qr-title" onClose={()=>opener.current?.focus()} onClick={event=>{if(event.target===event.currentTarget)closeDialog(dialog.current);}}><div><h2 id="large-qr-title">{c.qr}</h2><Image src={dataUrl} alt={c.qr} width={384} height={384} unoptimized /><button ref={close} type="button" className="button button--secondary" onClick={()=>closeDialog(dialog.current)}>{c.close}</button></div></dialog>
  </div>;
}
