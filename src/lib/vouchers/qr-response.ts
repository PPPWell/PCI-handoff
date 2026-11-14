import type { VoucherReadResult } from "./read";
import { makeVoucherQr } from "./qr";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
export async function voucherQrResponse(result:VoucherReadResult,token:string,origin:string|undefined,download=false):Promise<Response> {
  if(result.kind!=="found")return Response.json({ok:false,code:result.kind},{status:result.kind==="not-found"?404:503,headers});
  if(!result.view.vouchers.some(v=>v.usable))return Response.json({ok:false,code:"voucher_not_usable"},{status:410,headers});
  const qr=await makeVoucherQr(token,result.view,origin);if(!qr)return Response.json({ok:false,code:"qr_unavailable"},{status:503,headers});
  return new Response(new Uint8Array(qr.png),{headers:{...headers,"Content-Type":"image/png","Content-Disposition":`${download?"attachment":"inline"}; filename="palazzo-voucher.png"`}});
}
