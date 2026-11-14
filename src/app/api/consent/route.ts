import { NextResponse } from "next/server";
import { recordConsentChoice } from "@/lib/consent-tally";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

/** Counts a cookie-banner choice for the day. Nothing about the visitor is read, kept or returned. */
export async function POST(request: Request) {
  let choice: unknown;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).length !== 1) throw Error();
    choice = body.choice;
  } catch { return new NextResponse(null, { status: 400, headers }); }
  if (choice !== "accept" && choice !== "reject") return new NextResponse(null, { status: 400, headers });
  await recordConsentChoice(choice, { url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY });
  return new NextResponse(null, { status: 204, headers });
}
