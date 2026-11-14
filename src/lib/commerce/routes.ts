import { locales,type Locale } from "../i18n";
import type { Catalog,RouteEntry } from "../catalog/types";
export function paymentMethods(locale:Locale) {return ["card","apple-pay","google-pay",...(locale==="zh"?["alipay","wechat-pay"]:[])];}
export function getCommerceRoutes(catalog:Catalog,mode:"preview"|"published"=process.env.CONTENT_MODE==="published"?"published":"preview"):RouteEntry[] {
  return locales.flatMap(locale=>[
    ...catalog.offers.filter(offer=>catalog.places.some(place=>place.id===offer.placeId&&place.status!=="draft"&&place.translations[locale]&&catalog.cities.some(city=>city.id===place.facts.cityId&&city.status!=="draft"&&city.translations[locale]))).map(offer=>({id:`commerce:checkout:${offer.id}`,kind:"commerce" as const,locale,path:`/${locale}/checkout/${offer.id}/`,entityId:offer.id,commercePage:"checkout" as const,purchaseBar:true})),
    {id:"commerce:result",kind:"commerce" as const,locale,path:`/${locale}/success/`,commercePage:"result" as const},
    {id:"commerce:email-help",kind:"commerce" as const,locale,path:`/${locale}/email-help/`,commercePage:"email-help" as const},
    ...(mode==="preview"?[{id:"commerce:success-preview",kind:"commerce" as const,locale,path:`/${locale}/preview/purchase-success/`,commercePage:"success-preview" as const}]:[]),
  ]);
}
