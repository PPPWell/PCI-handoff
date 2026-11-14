import {managementResponse,managementEnvironment} from '@/lib/management/service';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{voucher:string}>}) {const {voucher}=await params;return managementResponse('start',request,voucher,managementEnvironment());}
export const GET=POST;export const HEAD=POST;export const OPTIONS=POST;export const PUT=POST;export const PATCH=POST;export const DELETE=POST;
