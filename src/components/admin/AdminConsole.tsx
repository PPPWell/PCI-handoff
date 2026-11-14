"use client";
import {useRouter} from 'next/navigation';
import {useState,type FormEvent} from 'react';
import type {AdminRestaurant,ContentCampaign} from '@/lib/admin/console';
import type {Locale} from '@/lib/i18n';

const copy={
 zh:{transfer:'更换店主',transferHint:'填新店主的邮箱即可。对方已登录过就立即生效，原店主马上失去商家端权限；还没登录过则先发出邀请，对方第一次用这个邮箱登录时自动接手，在此之前原店主照常使用。店员不受影响。',transferButton:'改为这个邮箱',owners:'店主：',noOwner:'还没有店主',invited:(email:string)=>`已邀请：${email}（等对方首次登录）`,sentInvite:'已开通，并发出邀请：对方首次登录后自动成为店主。',open:'开通',openAll:(n:number)=>n>1?`开通全部 ${n} 个套餐`:'开通',ownerEmail:'店主邮箱',ownerHint:'填店主的邮箱即可开通。对方第一次用这个邮箱登录商家端（palazzoitaliacina.com/ristorante）时自动成为店主。',active:'进行中',paused:'已暂停',notOpen:'未开通',pause:'暂停',resume:'恢复',saving:'处理中…',off:(c:number)=>`立减 €${c/100}`,months:(m:number)=>`${m} 个月有效`,days:(d:number)=>`${d} 天有效`,
  errors:{forbidden:'只有平台管理员可以操作。',invalid_request:'请求不完整，请刷新后重试。',invalid_email:'邮箱格式不对。',owner_not_verified:'这个邮箱还没有在网站登录过。请店主先登录一次，再开通。',restaurant_differs:'这家餐厅在数据库里的设置和内容不一致（可能已暂停），请先核对。',owner_differs:'这家餐厅已经有另一位店主，或这个账号是店员。',campaign_differs:'这个活动在数据库里的金额、有效期或文字和内容不一致，请先核对内容文件。',not_found:'内容里找不到这个活动。',unavailable:'暂时无法保存，请稍后重试。'} as Record<string,string>},
 it:{transfer:'Cambia titolare',transferHint:'Inserisci l’email del nuovo titolare. Se ha già effettuato l’accesso, il cambio è immediato e il titolare precedente perde subito l’accesso; altrimenti l’invito resta in attesa e scatta al suo primo accesso (fino ad allora resta il titolare attuale). Lo staff non cambia.',transferButton:'Passa a questa email',owners:'Titolari: ',noOwner:'Nessun titolare',invited:(email:string)=>`Invitato: ${email} (in attesa del primo accesso)`,sentInvite:'Attivato e invito inviato: il titolare lo diventa al primo accesso.',open:'Attiva',openAll:(n:number)=>n>1?`Attiva tutti i ${n} menù`:'Attiva',ownerEmail:'Email del titolare',ownerHint:'Basta l’email del titolare: diventa titolare al suo primo accesso all’area ristoranti (palazzoitaliacina.com/ristorante).',active:'Attiva',paused:'In pausa',notOpen:'Non attiva',pause:'Metti in pausa',resume:'Riattiva',saving:'Salvataggio…',off:(c:number)=>`Sconto ${c/100} €`,months:(m:number)=>`Valido ${m} mesi`,days:(d:number)=>`Valido ${d} giorni`,
  errors:{forbidden:'Solo gli amministratori possono farlo.',invalid_request:'Richiesta incompleta: ricarica e riprova.',invalid_email:'Email non valida.',owner_not_verified:'Questa email non ha ancora effettuato l’accesso. Il titolare deve accedere una volta.',restaurant_differs:'Il ristorante nel database non corrisponde ai contenuti (forse è in pausa).',owner_differs:'Il ristorante ha già un altro titolare, oppure questo account è staff.',campaign_differs:'La campagna nel database non corrisponde ai contenuti.',not_found:'Campagna non trovata nei contenuti.',unavailable:'Salvataggio non riuscito. Riprova tra poco.'} as Record<string,string>},
 en:{transfer:'Change owner',transferHint:'Enter the new owner’s email. If they have signed in before, the change is immediate and the previous owner loses access at once; otherwise the invite waits and takes effect at their first sign-in (the current owner keeps access until then). Staff stay.',transferButton:'Switch to this email',owners:'Owners: ',noOwner:'No owner yet',invited:(email:string)=>`Invited: ${email} (waiting for first sign-in)`,sentInvite:'Opened and invite sent: they become owner at their first sign-in.',open:'Open',openAll:(n:number)=>n>1?`Open all ${n} menus`:'Open',ownerEmail:'Owner email',ownerHint:'The owner’s email is enough: they become owner at their first sign-in to the restaurant area (palazzoitaliacina.com/ristorante).',active:'Active',paused:'Paused',notOpen:'Not open',pause:'Pause',resume:'Resume',saving:'Saving…',off:(c:number)=>`€${c/100} off`,months:(m:number)=>`Valid ${m} months`,days:(d:number)=>`Valid ${d} days`,
  errors:{forbidden:'Only platform admins can do this.',invalid_request:'Incomplete request. Refresh and try again.',invalid_email:'That email is not valid.',owner_not_verified:'This email has not signed in yet. Ask the owner to sign in once.',restaurant_differs:'The restaurant in the database differs from the content (it may be paused).',owner_differs:'The restaurant already has another owner, or this account is staff.',campaign_differs:'The campaign in the database differs from the content.',not_found:'Campaign not found in the content.',unavailable:'Could not save. Try again shortly.'} as Record<string,string>},
} satisfies Record<Locale,unknown>;

async function send(body:Record<string,string>):Promise<string|null|'invited'>{
 try{const response=await fetch('/api/admin/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',signal:AbortSignal.timeout(12000)});
  const value=await response.json() as {ok?:boolean;code?:string;invited?:boolean};return value.ok?(value.invited?'invited':null):String(value.code??'unavailable');}catch{return 'unavailable';}
}

/** One block per restaurant: name the owner once and open every coupon menu not yet open; once open, each menu can be paused and resumed. */
export function AdminConsole({locale,campaigns,restaurants}:{locale:Locale;campaigns:ContentCampaign[];restaurants:AdminRestaurant[]}){
 const c=copy[locale],router=useRouter(),[busy,setBusy]=useState<string|null>(null),[errors,setErrors]=useState<Record<string,string>>({});
 const report=(id:string,code:string|null)=>setErrors(e=>({...e,[id]:code?(code==='invited'?c.sentInvite:c.errors[code]??c.errors.unavailable):''}));
 async function run(id:string,body:Record<string,string>){setBusy(id);const code=await send(body);report(id,code);setBusy(null);if(!code||code==='invited')router.refresh();}
 // Opens the menus one after another and stops at the first refusal, so the reason shows next to the restaurant.
 async function openAll(placeId:string,ids:string[],email:string){setBusy(placeId);let code:string|null=null;for(const id of ids){const result=await send({action:'setup',campaignId:id,ownerEmail:email});if(result==='invited')code=result;else if(result){code=result;break;}}report(placeId,code);setBusy(null);router.refresh();}
 const places=[...new Set(campaigns.map(x=>x.placeId))];
 return <div className="admin-console">{places.map(placeId=>{
  const items=campaigns.filter(x=>x.placeId===placeId),restaurant=restaurants.find(r=>r.placeId===placeId);
  const closed=items.filter(item=>!restaurant?.campaigns.some(x=>x.id===item.campaignId)).map(item=>item.campaignId);
  return <section key={placeId} className="admin-restaurant" aria-labelledby={`admin-${placeId}`}>
   <h2 id={`admin-${placeId}`} lang="it">{items[0].restaurant}</h2>
   <p className="small-copy">{c.owners}{restaurant?.owners.length?restaurant.owners.join('、'):c.noOwner}{restaurant?.invite&&<><br />{c.invited(restaurant.invite)}</>}</p>
   <ul className="admin-campaigns">{items.map(item=>{
    const live=restaurant?.campaigns.find(x=>x.id===item.campaignId),id=item.campaignId,error=errors[id];
    return <li key={id} className="admin-campaign">
     <div className="admin-campaign__head"><strong>{item.menu}</strong><span className={`badge admin-status admin-status--${live?.status??'none'}`}>{live?live.status==='active'?c.active:c.paused:c.notOpen}</span></div>
     <p className="small-copy">{c.off(item.discountCents)} · {item.validityDays?c.days(item.validityDays):c.months(item.validityMonths??0)} · <code>{id}</code></p>
     {live&&<button type="button" className="button button--secondary" disabled={busy!==null} onClick={()=>run(id,{action:'status',campaignId:id,status:live.status==='active'?'paused':'active'})}>{busy===id?c.saving:live.status==='active'?c.pause:c.resume}</button>}
     {error&&<p className="field-error" role="alert">{error}</p>}
    </li>;})}</ul>
   {closed.length>0&&<form className="admin-open" onSubmit={(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const email=String(new FormData(event.currentTarget).get('owner')??'');void openAll(placeId,closed,email);}}>
    <label className="field" htmlFor={`owner-${placeId}`}>{c.ownerEmail}<input id={`owner-${placeId}`} name="owner" type="email" autoComplete="off" required maxLength={254} defaultValue={restaurant?.owners[0]??''} aria-describedby={`owner-hint-${placeId}`} /></label>
    <p id={`owner-hint-${placeId}`} className="small-copy">{c.ownerHint}</p>
    <button type="submit" className="button button--primary" disabled={busy!==null}>{busy===placeId?c.saving:c.openAll(closed.length)}</button>
   </form>}
   {errors[placeId]&&<p className={errors[placeId]===c.sentInvite?'small-copy':'field-error'} role={errors[placeId]===c.sentInvite?'status':'alert'}>{errors[placeId]}</p>}
   {/* After a test setup, the restaurant is handed to its real owner here. */}
   {restaurant&&<details className="admin-transfer"><summary>{c.transfer}</summary>
    <form onSubmit={(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=event.currentTarget,email=String(new FormData(form).get('owner')??'');void run(`owner-${placeId}`,{action:'owner',restaurantId:restaurant.id,ownerEmail:email}).then(()=>form.reset());}}>
     <label className="field" htmlFor={`transfer-${placeId}`}>{c.ownerEmail}<input id={`transfer-${placeId}`} name="owner" type="email" autoComplete="off" required maxLength={254} aria-describedby={`transfer-hint-${placeId}`} /></label>
     <p id={`transfer-hint-${placeId}`} className="small-copy">{c.transferHint}</p>
     <button type="submit" className="button button--secondary" disabled={busy!==null}>{busy===`owner-${placeId}`?c.saving:c.transferButton}</button>
    </form>
    {errors[`owner-${placeId}`]&&<p className={errors[`owner-${placeId}`]===c.sentInvite?'small-copy':'field-error'} role={errors[`owner-${placeId}`]===c.sentInvite?'status':'alert'}>{errors[`owner-${placeId}`]}</p>}
   </details>}
  </section>;})}</div>;
}
