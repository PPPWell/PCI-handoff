import type{Locale}from'../i18n';
/** Only explicit product destinations; never follow arbitrary browser-supplied redirects. */
export function couponReturnPath(value:unknown,locale:Locale):string{if(typeof value==='string'&&value.length<=180&&new RegExp(`^/${locale}/(?:account/|claim/[a-z0-9][a-z0-9-]{1,99}/(?:\\?go=1)?|subscribe/(?:confirm/|unsubscribe/)?)$`).test(value))return value;return`/${locale}/account/`;}
