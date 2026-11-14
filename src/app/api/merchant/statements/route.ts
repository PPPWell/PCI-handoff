import {statementResponse} from '@/lib/merchant/statement-service';import {authEnvironment} from '@/lib/auth/client';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=(request:Request)=>statementResponse(request,authEnvironment());export const POST=GET;export const OPTIONS=GET;
