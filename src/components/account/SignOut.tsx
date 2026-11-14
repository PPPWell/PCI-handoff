"use client";
import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {accountCopy} from '@/lib/auth/copy';
export function SignOut({locale,redirectTo}:{locale:Locale;redirectTo?:string}) {const c=accountCopy[locale],[pending,setPending]=useState(false),[failed,setFailed]=useState(false),busy=useRef(false);async function signOut(){if(busy.current)return;busy.current=true;setPending(true);setFailed(false);try{const response=await fetch('/api/auth/logout/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok||result?.ok!==true||result.code!=='signed_out')throw Error();
// Clear personalized client/RSC state when the identity changes.
window.location.assign(redirectTo??`/${locale}/account/`);}catch{setFailed(true);}finally{busy.current=false;setPending(false);}}return <><button className="button button--secondary" type="button" onClick={signOut} disabled={pending}>{pending?c.working:c.logout}</button>{failed&&<p role="alert">{c.errors.unavailable}</p>}</>;}
