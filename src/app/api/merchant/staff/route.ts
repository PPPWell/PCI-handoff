import{staffActionResponse}from'@/lib/merchant/staff-members';import{couponFail}from'@/lib/coupons/client';import{authEnvironment}from'@/lib/auth/client';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const POST=(request:Request)=>staffActionResponse(request,authEnvironment());
const denied=()=>couponFail('invalid_request',405);export{denied as GET,denied as HEAD,denied as OPTIONS,denied as PUT,denied as DELETE,denied as PATCH};
