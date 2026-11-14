import {merchantResponse} from '@/lib/merchant/service';import {authEnvironment} from '@/lib/auth/client';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){return merchantResponse(request,(await params).token,authEnvironment());}
export const GET=POST;export const HEAD=POST;export const OPTIONS=POST;export const PUT=POST;export const PATCH=POST;export const DELETE=POST;
