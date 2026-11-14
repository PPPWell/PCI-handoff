import {cookies} from 'next/headers';
import {authEnvironment,createAuthClient,validatedAuthConfig} from '@/lib/auth/client';
import {authPrivateHeaders,normalizedEmail} from '@/lib/auth/service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(email:string|null)=>Response.json({email},{headers:authPrivateHeaders});
/** Who is signed in, for the site header on static pages. Visitors without a session cookie never reach Supabase. */
export async function GET() {
 const config=validatedAuthConfig(authEnvironment());if(!config)return reply(null);
 try{const store=await cookies();if(!store.getAll().some(c=>c.name.startsWith('sb-')))return reply(null);
  // A refresh rotates the token, so the new cookies must be written back here or the session would break.
  const client=createAuthClient(config,{getAll:()=>store.getAll(),setAll:items=>{for(const item of items)store.set(item.name,item.value,{...item.options,httpOnly:true,secure:config.secure,sameSite:'lax',path:'/'});}});
  const {data}=await client.auth.getUser();
  return reply(data.user?.email_confirmed_at?normalizedEmail(data.user.email):null);
 }catch{return reply(null);}
}
