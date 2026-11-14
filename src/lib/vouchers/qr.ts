import QRCode from "qrcode";
import type { VoucherView } from "./read";
import { hashVoucherToken } from "./tokens";
export async function makeVoucherQr(token:string,view:VoucherView,origin:string|undefined) {
  try {
    hashVoucherToken(token);if(!view.vouchers.some(voucher=>voucher.usable))return null;
    const url=new URL(origin??"");if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||!(url.protocol==="https:"||process.env.CONTENT_MODE!=="published"&&url.protocol==="http:"&&url.hostname==="127.0.0.1"))return null;
    const href=new URL(`/v/${token}/`,url).href,png=await QRCode.toBuffer(href,{type:"png",errorCorrectionLevel:"M",margin:4,width:384});
    return {png,dataUrl:`data:image/png;base64,${png.toString("base64")}`};
  }catch{return null;}
}
