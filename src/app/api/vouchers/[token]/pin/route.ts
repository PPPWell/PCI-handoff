import {pinRequestResponse} from '@/lib/vouchers/pin-service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}) {
 const {token}=await params;
 return pinRequestResponse(request,token,{siteOrigin:process.env.SITE_ORIGIN,url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY});
}
// Explicit handlers also protect rejected methods; Next's automatic 405/OPTIONS omit these headers.
export const GET=POST;
export const HEAD=POST;
export const PUT=POST;
export const PATCH=POST;
export const DELETE=POST;
export const OPTIONS=POST;
