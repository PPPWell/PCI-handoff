import{readDiscountCoupon}from'@/lib/coupons/service';import{couponJson,couponFail}from'@/lib/coupons/client';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){const{token}=await params,result=await readDiscountCoupon(token,{url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY});return result.kind==='found'?couponJson({...result.view}):couponFail(result.kind==='not-found'?'not_found':'unavailable',result.kind==='not-found'?404:503);}
const denied=()=>couponFail('invalid_request',405);export{denied as POST,denied as HEAD,denied as OPTIONS,denied as PUT,denied as DELETE,denied as PATCH};
