/** QR data is never fetched. Accept only canonical, same-origin voucher links. */
export function parseVoucherLink(value:string,origin:string):string|null {
 try{if(value.length>2048)return null;const url=new URL(value),trusted=new URL(origin);if(url.origin!==trusted.origin||url.username||url.password||url.search||url.hash)return null;const match=url.pathname.match(/^\/v\/([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])\/?$/);return match?.[1]??null;}catch{return null;}
}

/** Route only canonical same-origin QR capabilities, without fetching their content. */
export function parseRestaurantQr(value:string,origin:string):{kind:'voucher'|'coupon';token:string}|null{
 const token=parseVoucherLink(value,origin);if(token)return{kind:'voucher',token};
 try{if(value.length>2048)return null;const url=new URL(value),trusted=new URL(origin);if(url.origin!==trusted.origin||url.username||url.password||url.search||url.hash)return null;const match=url.pathname.match(/^\/c\/([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])\/?$/);return match?{kind:'coupon',token:match[1]}:null;}catch{return null;}
}
