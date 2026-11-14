import {NextResponse,type NextRequest} from 'next/server';
import type {CookieOptions} from '@supabase/ssr';
import {createAuthClient,type ValidAuthConfig} from './client';
/** Account, merchant and voucher requests call this. Each refresh writes identical cookies to RSC and browser. */
export async function refreshAccountSession(request:NextRequest,forwarded:Headers,config:ValidAuthConfig,transport:typeof fetch=fetch) {
 const writes:{name:string;value:string;options:CookieOptions}[]=[],cache:Record<string,string>={};
 const client=createAuthClient(config,{getAll:()=>request.cookies.getAll(),setAll:(items,headers)=>{for(const item of items){request.cookies.set(item.name,item.value);writes.push(item);}Object.assign(cache,headers);}},transport);
 // No session cookie means nothing to refresh: skip the Supabase round trip for signed-out visitors (coupon links, claim pages).
 if(request.cookies.getAll().some(c=>c.name.startsWith('sb-')))await client.auth.getUser();
 forwarded.set('cookie',request.headers.get('cookie')??'');const response=NextResponse.next({request:{headers:forwarded}});
 for(const item of writes)response.cookies.set(item.name,item.value,{...item.options,httpOnly:true,secure:config.secure,sameSite:'lax',path:'/'});
 for(const [key,value] of Object.entries(cache))response.headers.set(key,value);
 return response;
}
