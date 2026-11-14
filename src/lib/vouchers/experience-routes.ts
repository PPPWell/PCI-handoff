import { locales } from "../i18n";
import type { RouteEntry } from "../catalog/types";
export const experiencePages=["voucher","qr","share","refund","staff","hotel","replies","account","verify"] as const;
export type ExperiencePageId=typeof experiencePages[number];
export function getExperienceRoutes(mode:"preview"|"published"=process.env.CONTENT_MODE==="published"?"published":"preview"):RouteEntry[] {
  return locales.flatMap(locale=>experiencePages.filter(page=>(mode==="preview"||page==="account"||page==="verify")&&!(locale==="it"&&(page==="hotel"||page==="replies"))).map(page=>({id:`experience:${page}`,kind:"experience" as const,locale,experiencePage:page,path:page==="account"?`/${locale}/account/`:page==="verify"?`/${locale}/account/verify/`:`/${locale}/preview/voucher/${page==="voucher"?"":page+"/"}`})));
}
