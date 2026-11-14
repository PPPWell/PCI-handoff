"use client";
import {useRouter} from 'next/navigation';
import {useState,type FormEvent} from 'react';
import type {StaffMember} from '@/lib/merchant/staff-members';

const errors:Record<string,string>={
 forbidden:'Solo il titolare può gestire lo staff.',invalid_request:'Richiesta non valida. Ricaricate la pagina.',invalid_email:'Email non valida.',
 staff_not_verified:'Questa email non ha ancora effettuato l’accesso. Chiedete alla persona di aprire l’area ristorante e accedere una volta, poi aggiungetela qui.',
 owner_differs:'Questa email è del titolare.',unavailable:'Salvataggio non riuscito. Riprovate tra poco.',
};

async function save(restaurantId:string,email:string,active:boolean):Promise<string|null>{
 try{const r=await fetch('/api/merchant/staff/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({restaurantId,email,active}),credentials:'same-origin',signal:AbortSignal.timeout(12000)});
  const v=await r.json() as {ok?:boolean;code?:string};return v.ok?null:String(v.code??'unavailable');}catch{return 'unavailable';}
}

/** Owner-only: each staff member signs in with their own email; removing them ends their access to this restaurant. */
export function MerchantStaff({restaurantId,staff}:{restaurantId:string;staff:StaffMember[]}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[added,setAdded]=useState('');
 async function run(email:string,active:boolean){setBusy(true);setError('');setAdded('');const code=await save(restaurantId,email,active);setBusy(false);if(code){setError(errors[code]??errors.unavailable);return;}if(active)setAdded(email);router.refresh();}
 const current=staff.filter(s=>s.active);
 return <>
  {current.length?current.map(s=><div key={s.email} className="staff-row staff-row--static staff-member"><span>{s.email}</span><button type="button" className="button button--quiet" disabled={busy} onClick={()=>run(s.email,false)}>Rimuovete</button></div>)
   :<p className="staff-row staff-row--static"><span>Nessuno staff</span><small>Per ora convalida solo il titolare.</small></p>}
  <form className="staff-add" onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget,email=String(new FormData(form).get('email')??'').trim();if(email)void run(email,true).then(()=>form.reset());}}>
   <label className="field" htmlFor="staff-email">Aggiungete un membro dello staff (email)<input id="staff-email" name="email" type="email" autoComplete="off" required maxLength={254} placeholder="nome@esempio.it" aria-describedby="staff-hint" /></label>
   <p id="staff-hint" className="small-copy">La persona accede prima una volta all’area ristorante con la propria email; poi la aggiungete qui. Lo staff convalida i coupon, ma non vede questa pagina.</p>
   <button type="submit" className="button button--secondary staff-action" disabled={busy}>Aggiungete</button>
  </form>
  {added&&<p className="small-copy" role="status">{added}: aggiunto allo staff.</p>}
  {error&&<p className="field-error" role="alert">{error}</p>}
 </>;
}
