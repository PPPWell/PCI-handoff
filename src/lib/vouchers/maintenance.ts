import { createHash, timingSafeEqual } from "node:crypto";
export interface MaintenanceCounts {expired:number;queued:number}
const privateHeaders={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
function validCounts(value:unknown):value is MaintenanceCounts {
  if(!value||typeof value!=="object"||Array.isArray(value)) return false;const data=value as Record<string,unknown>;
  return Number.isSafeInteger(data.expired)&&Number(data.expired)>=0&&Number.isSafeInteger(data.queued)&&Number(data.queued)>=0;
}
/** This server-only boundary uses the current Supabase secret-key API, never browser credentials. */
export async function supabaseServiceRpc(config:{url?:string;secretKey?:string},transport:typeof fetch=fetch):Promise<MaintenanceCounts> {
  try {
    const url=new URL(config.url??"");
    if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||!/^sb_secret_[A-Za-z0-9_-]+$/.test(config.secretKey??"")) throw new Error();
    const response=await transport(new URL("/rest/v1/rpc/pci_run_voucher_maintenance",url),{method:"POST",headers:{apikey:config.secretKey!,"Content-Type":"application/json"},body:"{}",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!response.ok) throw new Error();const result:unknown=await response.json();if(!validCounts(result)) throw new Error();return result;
  }catch{throw new Error("Voucher maintenance unavailable");}
}
export async function handleVoucherMaintenance(request:Request,secret:string|undefined,run:()=>Promise<MaintenanceCounts>):Promise<Response> {
  const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:privateHeaders});
  if(request.method!=="GET") return reply({ok:false,code:"method_not_allowed"},405);
  if(!secret||secret.length<32) return reply({ok:false,code:"maintenance_unavailable"},503);
  const provided=request.headers.get("authorization")??"",expected=`Bearer ${secret}`;
  const digest=(value:string)=>createHash("sha256").update(value,"utf8").digest();
  if(!timingSafeEqual(digest(provided),digest(expected))) return reply({ok:false,code:"unauthorized"},401);
  try {const counts=await run();if(!validCounts(counts)) throw new Error();return reply({ok:true,expired:counts.expired,queued:counts.queued},200);}
  catch{return reply({ok:false,code:"maintenance_unavailable"},503);}
}
