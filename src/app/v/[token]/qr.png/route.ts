import { readVoucher } from "@/lib/vouchers/read";
import { voucherQrResponse } from "@/lib/vouchers/qr-response";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params,result=await readVoucher(token,{url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY});
  return voucherQrResponse(result,token,process.env.SITE_ORIGIN,new URL(request.url).searchParams.get("download")==="1");
}
