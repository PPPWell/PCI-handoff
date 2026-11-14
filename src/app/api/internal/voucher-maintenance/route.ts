import { handleVoucherMaintenance, supabaseServiceRpc } from "@/lib/vouchers/maintenance";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  return handleVoucherMaintenance(request,process.env.CRON_SECRET,()=>supabaseServiceRpc({url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY}));
}
