export interface ReservationInput {date:string;time:string;people:number;name:string;menu:string;example:boolean}
export interface ReservationChannels {whatsapp:string|null;email:string|null}
export function directReservationLinks(channels:ReservationChannels&{phone?:string|null}) {
  const phone=channels.phone?.replace(/[ ()-]/g,""),whatsapp=channels.whatsapp?.replace(/[ ()-]/g,""),email=channels.email;
  return {...(phone&&/^\+[1-9]\d{7,14}$/.test(phone)?{phone:`tel:${phone}`} : {}),...(whatsapp&&/^\+[1-9]\d{7,14}$/.test(whatsapp)?{whatsapp:`https://wa.me/${whatsapp.slice(1)}`} : {}),...(email&&/^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)?{email:`mailto:${encodeURIComponent(email)}`} : {})};
}
export type ReservationResult={ok:false;field:"date"|"time"|"people"|"name"|"menu"}|{ok:true;message:string;whatsapp?:string;email?:string};
const romeFormatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function parts(date:Date) {return Object.fromEntries(romeFormatter.formatToParts(date).map(part=>[part.type,part.value]));}
export function romeDate(date:Date=new Date()) {const p=parts(date);return `${p.year}-${p.month}-${p.day}`;}
const unsafeText=/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
/** Wall-clock input stays in Italy; reject the spring DST gap instead of silently shifting time. */
export function buildReservation(input:ReservationInput,channels:ReservationChannels,now:Date=new Date()):ReservationResult {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return {ok:false,field:"date"};
  const [year,month,day]=input.date.split("-").map(Number),calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||input.date<romeDate(now)) return {ok:false,field:"date"};
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return {ok:false,field:"time"};
  const [hour,minute]=input.time.split(":").map(Number),wallTime=Date.UTC(year,month-1,day,hour,minute);
  const instants=[60,120].map(offset=>new Date(wallTime-offset*60000)).filter(date=>{const p=parts(date);return `${p.year}-${p.month}-${p.day}`===input.date&&`${p.hour}:${p.minute}`===input.time;});
  if(!instants.some(date=>date.getTime()>=now.getTime())) return {ok:false,field:"time"};
  if(!Number.isSafeInteger(input.people)||input.people<1||input.people>100) return {ok:false,field:"people"};
  const name=input.name.trim();if(!name||name.length>100||unsafeText.test(name)) return {ok:false,field:"name"};
  const menu=input.menu.trim();if(!menu||menu.length>300||unsafeText.test(menu)) return {ok:false,field:"menu"};
  const message=`${input.example?"ESEMPIO — nessun voucher reale.\n":""}Buongiorno, vorrei prenotare un tavolo per ${input.people} ${input.people===1?"persona":"persone"} il ${String(day).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year} alle ${input.time}, a nome ${name}. Ho il voucher Palazzo Italia-Cina per il menù ${menu}. Grazie!`;
  const phone=channels.whatsapp?.replace(/[ ()-]/g,"");
  const email=channels.email;
  return {ok:true,message,...(phone&&/^\+[1-9]\d{7,14}$/.test(phone)?{whatsapp:`https://wa.me/${phone.slice(1)}?${new URLSearchParams({text:message})}`} : {}),...(email&&/^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)?{email:`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Prenotazione — Palazzo Italia-Cina")}&body=${encodeURIComponent(message)}`}:{})};
}
