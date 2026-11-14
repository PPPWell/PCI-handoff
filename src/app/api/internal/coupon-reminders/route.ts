import { handleCouponReminders, runCouponReminders } from "@/lib/coupons/reminders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handleCouponReminders(request, process.env.CRON_SECRET, () => runCouponReminders({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY }));
}
