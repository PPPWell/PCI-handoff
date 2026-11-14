import type { Locale } from "../i18n";
export function detectInAppBrowser(userAgent: string, locale: Locale): string | null {
  if (locale !== "it") {
    if (/MicroMessenger/i.test(userAgent)) return "WeChat";
    if (/xhsmini|XiaoHongShu/i.test(userAgent)) return "Xiaohongshu";
  }
  if (locale !== "zh") {
    if (/Instagram/i.test(userAgent)) return "Instagram";
    if (/FBAN|FBAV/i.test(userAgent)) return "Facebook";
    if (/TikTok|BytedanceWebview/i.test(userAgent)) return "TikTok";
  }
  return null;
}
