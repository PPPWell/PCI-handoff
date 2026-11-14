import {handleNotificationDelivery,notificationEnvironment} from '@/lib/notifications/worker';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleNotificationDelivery(request,notificationEnvironment());export const POST=GET;export const OPTIONS=GET;
