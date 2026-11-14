import {handleMerchantReports} from '@/lib/notifications/merchant-worker';
import {notificationEnvironment} from '@/lib/notifications/worker';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleMerchantReports(request,notificationEnvironment());export const POST=GET;export const OPTIONS=GET;
