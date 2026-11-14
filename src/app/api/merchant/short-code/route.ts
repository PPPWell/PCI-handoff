import {shortCodeResponse} from '@/lib/merchant/short-code-service';import {authEnvironment} from '@/lib/auth/client';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){return shortCodeResponse(request,authEnvironment());}
export const GET=POST;export const HEAD=POST;export const OPTIONS=POST;export const PUT=POST;export const PATCH=POST;export const DELETE=POST;
