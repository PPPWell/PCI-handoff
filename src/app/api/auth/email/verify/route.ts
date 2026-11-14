import {emailAuthResponse} from '@/lib/auth/service';
import {authEnvironment} from '@/lib/auth/client';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(request:Request) {return emailAuthResponse('verify',request,authEnvironment());}
export const GET=POST;export const HEAD=POST;export const OPTIONS=POST;
export const PUT=POST;export const PATCH=POST;export const DELETE=POST;
