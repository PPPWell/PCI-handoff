import tokens from '../../../docs/design-system/tokens.json';
import {formatStatementMoney,statementKinds} from '../merchant/statement-types';
import {parseMerchantReportFacts,type MerchantReportFacts} from './merchant-types';
import {parseFrozenMessage,type NotificationRuntime,type MailMessage} from './types';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const colors=new Map(tokens.color.tokens.map(t=>[t.name,t.value]));function color(name:string):string{const value=colors.get(name);if(!value)throw Error('Missing email token');return /^\{(.+)\}$/.test(value)?color(value.slice(1,-1)):value;}
export async function renderMerchantReport(id:string,raw:MerchantReportFacts,config:NotificationRuntime):Promise<MailMessage>{
 const f=parseMerchantReportFacts(raw),subject=(f.kind==='merchant-daily'?'Riepilogo giornaliero':'Rendiconto settimanale')+' · '+f.periodStart,when=(s:string)=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',dateStyle:'short',timeStyle:'short'}).format(new Date(s));
 const link=new URL('/it/merchant/statements/',config.origin);link.searchParams.set('restaurant',f.restaurantId);
 const text:string[]=['Palazzo Italia-Cina',subject,f.restaurant,`Periodo di registrazione: ${f.periodStart} — ${f.periodEnd} (fine esclusa, Europe/Rome)`,`Dati acquisiti: ${when(f.sourceAsOf)}`],html:string[]=[`<p>Palazzo Italia-Cina</p><h1>${escape(subject)}</h1><p>${escape(f.restaurant)}</p>`];
 function paragraph(s:string){text.push(s);html.push('<p>'+escape(s)+'</p>');}
 paragraph(text[3]);paragraph(text[4]);paragraph('I movimenti sono raggruppati per data di registrazione. Le operazioni registrate in ritardo compaiono nel periodo successivo; il rendiconto mensile usa la data dell’operazione.');
 const counts=[['Voucher venduti',f.totals.sold],['Voucher gratuiti emessi',f.totals.issued],['Convalide',f.totals.redeemed],['Convalide annullate',f.totals.undone],['Rimborsi completati',f.totals.refunded],['Movimenti online',formatStatementMoney(f.totals.onlineCents)],['Commissione',formatStatementMoney(f.totals.commissionCents)],['IVA commissione',formatStatementMoney(f.totals.commissionVatCents)],['Movimenti con accordi da verificare',f.totals.unknown]];
 for(const [label,value] of counts)paragraph(label+': '+value);
 html.push('<h2>Movimenti registrati</h2>');text.push('Movimenti registrati');
 if(!f.rows.length)paragraph('Nessun movimento registrato nel periodo.');else{
  html.push('<table style="width:100%;border-collapse:collapse;font-size:14px"><caption>Dettaglio completo dei movimenti</caption><thead><tr>'+['Riferimento','Tipo e menù','Quantità','Avvenuto','Registrato','Online','Commissione','IVA commissione'].map(label=>'<th scope="col" style="text-align:left;border-bottom:1px solid '+color('line')+'">'+escape(label)+'</th>').join('')+'</tr></thead><tbody>');
  for(const row of f.rows){const cells=[row.id,statementKinds[row.kind]+' · '+row.menu,String(row.quantity),when(row.occurredAt),when(row.recordedAt),formatStatementMoney(row.onlineCents),formatStatementMoney(row.commissionCents),formatStatementMoney(row.commissionVatCents)];text.push(cells.join(' | '));html.push('<tr>'+cells.map(cell=>'<td style="padding:8px 4px;border-bottom:1px solid '+color('line')+'">'+escape(cell)+'</td>').join('')+'</tr>');}html.push('</tbody></table>');
 }
 html.push('<h2>Richieste di recesso</h2>');text.push('Richieste di recesso');paragraph('Le richieste registrate non sono rimborsi completati. Gli importi dei rimborsi completati sono elencati separatamente tra i movimenti.');
 if(!f.withdrawals.length)paragraph('Nessuna richiesta registrata nel periodo.');else for(const w of f.withdrawals)paragraph(`${w.menu} · ${formatStatementMoney(w.amountCents)} · Avvenuto: ${when(w.occurredAt)} · Registrato: ${when(w.recordedAt)} · ${w.id}`);
 paragraph('Questo riepilogo non verifica il saldo Stripe, gli accrediti bancari o una fattura. Gli accordi storici mancanti restano da verificare.');
 text.push('Apri il rendiconto mensile: '+link.href);html.push('<p><a style="display:inline-block;padding:12px 24px;line-height:24px;background:'+color('primary')+';color:'+color('on-primary')+';border-radius:8px" href="'+escape(link.href)+'">Apri il rendiconto mensile</a></p>');
 paragraph(config.policy.copy.it.footer);paragraph(config.policy.company);text.push('Assistenza: '+config.replyTo);html.push('<p><a href="mailto:'+escape(config.replyTo)+'">Assistenza</a></p>');
 const document='<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+escape(subject)+'</title></head><body style="margin:0;background:'+color('bg')+';color:'+color('ink')+';font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:16px;line-height:1.6"><div style="padding:24px 20px;max-width:960px;margin:auto">'+html.join('\n')+'</div></body></html>';
 return parseFrozenMessage(JSON.stringify({from:config.from,reply_to:config.replyTo,to:[f.recipient],subject,html:document,text:text.join('\n\n'),headers:{'X-Entity-Ref-ID':id},tags:[{name:'notification_id',value:id}],attachments:[]}),id);
}
