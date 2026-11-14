import{couponActionResponse}from'@/lib/coupons/service';import{couponFail}from'@/lib/coupons/client';import{authEnvironment}from'@/lib/auth/client';import{voucherKeyring}from'@/lib/auth/account';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const POST=(request:Request)=>couponActionResponse(request,authEnvironment(),voucherKeyring(process.env));
const denied=()=>couponFail('invalid_request',405);export{denied as GET,denied as HEAD,denied as OPTIONS,denied as PUT,denied as DELETE,denied as PATCH};
