import{adminActionResponse}from'@/lib/admin/service';import{couponFail}from'@/lib/coupons/client';import{authEnvironment}from'@/lib/auth/client';import{getCatalog}from'@/lib/catalog/load';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const POST=(request:Request)=>adminActionResponse(request,authEnvironment(),getCatalog());
const denied=()=>couponFail('invalid_request',405);export{denied as GET,denied as HEAD,denied as OPTIONS,denied as PUT,denied as DELETE,denied as PATCH};
