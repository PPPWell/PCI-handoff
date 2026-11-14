import type { Locale } from "../i18n";

/** Extra sign-in wording for the two-step email code flow. Kept apart from auth/copy.ts, which is shared with older screens. */
const zh = {
  codeTitle: "输入验证码",
  sentTo: "已发到",
  changeEmail: "修改",
  resendIn: (seconds: number) => `${seconds} 秒后重发`,
  resendNow: "重新发送",
  spamHint: "没收到？也请看看垃圾邮件。",
  agree: ["继续即表示你接受", "，并已阅读", "。"] as [string, string, string],
  terms: "用户条款",
  privacy: "隐私政策",
  verifyClaim: "验证并领取",
  subscribeOption: "同时订阅新套餐和活动邮件（可选，随时退订）",
  emailPlaceholder: "name@example.com",
  invalidEmail: "请输入有效的邮箱地址。",
  wechat: "在微信里打开时：先别关闭本页，切到邮箱查看验证码，再回来输入；回来时页面会停在这一步。",
  providers: {
    qq: "QQ 邮箱：邮件可能延迟一两分钟，请同时查看“其他文件夹”和“垃圾箱”。",
    netease: "网易邮箱：邮件可能进入“垃圾邮件”，也可能延迟一两分钟。",
    gmail: "Gmail：请查看“垃圾邮件”或“促销”标签。",
    outlook: "Outlook：请查看“垃圾邮件”或“其他”收件箱。",
  },
};
const it: typeof zh = {
  codeTitle: "Inserisci il codice",
  sentTo: "Inviato a",
  changeEmail: "Modifica",
  resendIn: (seconds: number) => `Reinvia tra ${seconds} s`,
  resendNow: "Invia di nuovo",
  spamHint: "Non è arrivato? Controlla anche lo spam.",
  agree: ["Continuando accetti i ", " e dichiari di aver letto l’", "."] as [string, string, string],
  terms: "Termini d’uso",
  privacy: "Informativa sulla privacy",
  verifyClaim: "Verifica e richiedi",
  subscribeOption: "Iscrivimi anche a nuovi menù e novità (facoltativo, annulli quando vuoi)",
  emailPlaceholder: "nome@esempio.it",
  invalidEmail: "Inserisci un indirizzo email valido.",
  wechat: "In WeChat: non chiudere questa pagina, apri l’email e poi torna qui; la pagina resta a questo passaggio.",
  providers: { qq: "", netease: "", gmail: "Gmail: controlla spam e la scheda Promozioni.", outlook: "Outlook: controlla Posta indesiderata e Altro." },
};
const en: typeof zh = {
  codeTitle: "Enter the code",
  sentTo: "Sent to",
  changeEmail: "Change",
  resendIn: (seconds: number) => `Resend in ${seconds}s`,
  resendNow: "Send again",
  spamHint: "Nothing yet? Check your spam folder too.",
  agree: ["By continuing you accept the ", " and confirm you have read the ", "."] as [string, string, string],
  terms: "Terms of Use",
  privacy: "Privacy Policy",
  verifyClaim: "Verify and claim",
  subscribeOption: "Also email me new menus and news (optional, unsubscribe any time)",
  emailPlaceholder: "name@example.com",
  invalidEmail: "Enter a valid email address.",
  wechat: "Inside WeChat: keep this page open, check your email, then come back; the page stays on this step.",
  providers: { qq: "QQ Mail: delivery can take a minute or two; check Other folders and Junk.", netease: "NetEase Mail: the message may land in Junk or take a minute or two.", gmail: "Gmail: check Spam and the Promotions tab.", outlook: "Outlook: check Junk and the Other inbox." },
};
export const signinCopy: Record<Locale, typeof zh> = { zh, it, en };

export type MailProvider = keyof typeof zh.providers;
/** Provider-specific delivery tip, chosen only from the domain the person typed. */
export function mailProvider(email: string): MailProvider | null {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (domain === "qq.com" || domain === "foxmail.com" || domain === "vip.qq.com") return "qq";
  if (["163.com", "126.com", "yeah.net", "188.com"].includes(domain)) return "netease";
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) return "outlook";
  return null;
}
