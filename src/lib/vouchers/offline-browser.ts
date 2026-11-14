export interface OfflineReply {ok:boolean;status:string;snapshot?:unknown;now?:number;clockTrusted?:boolean}
/** Browser-only transport. Contains no bearer token or account storage. */
export async function offlineMessage(body:Record<string,unknown>,register=true):Promise<OfflineReply> {
 if(!window.isSecureContext||!('serviceWorker' in navigator))return {ok:false,status:'unavailable'};
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{let registration=register?await navigator.serviceWorker.register('/v/offline-worker.js',{scope:'/v/',type:'module',updateViaCache:'none'}):await navigator.serviceWorker.getRegistration(location.href);if(!registration)return {ok:false,status:'unavailable'};
  if(register&&!registration.active){registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error()),8000);})]);clearTimeout(timeout);}
  if(new URL(registration.scope).pathname!=='/v/'||!registration.active||new URL(registration.active.scriptURL).pathname!=='/v/offline-worker.js')throw Error();
  const worker=registration.active;return await new Promise((resolve)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve({ok:false,status:'unavailable'});},4000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();const raw=event.data;if(raw&&typeof raw.ok==='boolean'&&typeof raw.status==='string')resolve({ok:raw.ok,status:raw.status,snapshot:raw.snapshot,now:typeof raw.now==='number'&&Number.isFinite(raw.now)?raw.now:undefined,clockTrusted:raw.clockTrusted===false?false:true});else resolve({ok:false,status:'unavailable'});};worker.postMessage(body,[channel.port2]);});
 }catch{return {ok:false,status:'unavailable'};}finally{clearTimeout(timeout);}
}
