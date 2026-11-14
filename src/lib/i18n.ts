export type Locale = "zh" | "it" | "en";
export const locales: Locale[] = ["zh", "it", "en"];
export function isLocale(value: string): value is Locale { return locales.includes(value as Locale); }
export const languageNames: Record<Locale, string> = { zh: "中文", it: "Italiano", en: "English" };
export const htmlLanguages: Record<Locale, string> = { zh: "zh-CN", it: "it", en: "en" };
export const citySegments: Record<Locale, string> = { zh: "florence", it: "firenze", en: "florence" };

export const ui = {
  zh: {
    menu: "菜单", login: "登录", account: "个人中心", language: "选择语言", close: "关闭", home: "首页",
    navigation: "主要导航", mobileNavigation: "手机导航", footerNavigation: "页脚导航", skip: "跳至主要内容",
    comingSoon: "即将上线", preparing: "该栏目即将上线，目前可先浏览餐厅。", okay: "知道了",
    about: "关于我们", editorial: "编辑准则", partners: "商业合作", help: "常见问题", support: "联系我们",
    terms: "用户条款", refunds: "退款与延期", privacy: "隐私政策", cookie: "Cookie", subscribe: "订阅",
    follow: "关注我们", cookieTitle: "Cookie 设置", cookieText: "我们使用必要 Cookie 保证网站运行；统计 Cookie 仅在你同意后启用。",
    cookieMore: "了解详情", cookieCustomize: "自定义", cookieSave: "保存我的选择", cookiePrefsIntro: "你可以分别决定是否启用统计 Cookie。随时可以在页脚的“Cookie 设置”修改。", cookieNecessary: "必要 Cookie", cookieNecessaryText: "保证网站正常运行，例如记住你的语言和这里的选择。始终开启。", cookieAnalytics: "统计 Cookie", cookieAnalyticsText: "帮助我们了解哪些页面有用，数据汇总后使用，不用于广告。默认关闭。", cookieContinue: "不接受也可以继续浏览。", cookiePolicyLink: "查看 Cookie 政策", cookieDismiss: "关闭并继续（不启用统计）", reject: "全部拒绝", accept: "全部接受", cookieSettings: "Cookie 设置",
    languageSuggestion: "你也可以使用中文浏览。", storageNotice: "浏览器未能保存选择，本次访问将保持统计关闭。",
    photoPending: "实拍图片待补充", verified: "精选", discount: "专属套餐",
  },
  it: {
    menu: "Menu", login: "Accedi", account: "Il mio account", language: "Scegli la lingua", close: "Chiudi", home: "Home",
    navigation: "Navigazione principale", mobileNavigation: "Navigazione mobile", footerNavigation: "Navigazione nel piè di pagina", skip: "Vai al contenuto",
    comingSoon: "Presto online", preparing: "Questa sezione sarà online a breve; intanto puoi scoprire dove mangiare.", okay: "Ho capito",
    about: "Chi siamo", editorial: "Linee editoriali", partners: "Collaborazioni", help: "Domande frequenti", support: "Contatti",
    terms: "Termini d’uso", refunds: "Rimborsi e proroghe", privacy: "Privacy", cookie: "Cookie", subscribe: "Iscriviti",
    follow: "Seguici", cookieTitle: "Preferenze cookie", cookieText: "Usiamo cookie necessari al funzionamento del sito; quelli statistici solo se accetti.",
    cookieMore: "Maggiori informazioni", cookieCustomize: "Personalizza", cookieSave: "Salva le mie scelte", cookiePrefsIntro: "Puoi decidere separatamente se attivare i cookie statistici. Puoi cambiare idea in ogni momento da “Preferenze cookie” nel piè di pagina.", cookieNecessary: "Cookie necessari", cookieNecessaryText: "Servono al funzionamento del sito, ad esempio per ricordare la lingua e questa scelta. Sempre attivi.", cookieAnalytics: "Cookie statistici", cookieAnalyticsText: "Ci aiutano a capire quali pagine sono utili, con dati aggregati e senza finalità pubblicitarie. Disattivati per impostazione predefinita.", cookieContinue: "Puoi continuare a navigare anche senza accettare.", cookiePolicyLink: "Leggi la politica sui cookie", cookieDismiss: "Chiudi e continua senza accettare", reject: "Rifiuta tutti", accept: "Accetta tutti", cookieSettings: "Preferenze cookie",
    languageSuggestion: "Questa pagina è disponibile in italiano.", storageNotice: "Non è stato possibile salvare la scelta. Le statistiche restano disattivate per questa visita.",
    photoPending: "Foto sul posto in arrivo", verified: "Informazioni verificate il [data]", discount: "Menù esclusivo",
  },
  en: {
    menu: "Menu", login: "Sign in", account: "My account", language: "Choose language", close: "Close", home: "Home",
    navigation: "Main navigation", mobileNavigation: "Mobile navigation", footerNavigation: "Footer navigation", skip: "Skip to content",
    comingSoon: "Launching soon", preparing: "This section launches soon; meanwhile, see where to eat.", okay: "Got it",
    about: "About us", editorial: "Editorial policy", partners: "Work with us", help: "FAQ", support: "Contact us",
    terms: "Terms of use", refunds: "Refunds and extensions", privacy: "Privacy", cookie: "Cookies", subscribe: "Subscribe",
    follow: "Follow us", cookieTitle: "Cookie preferences", cookieText: "We use necessary cookies to run the site; analytics cookies only if you accept.",
    cookieMore: "Learn more", cookieCustomize: "Customize", cookieSave: "Save my choices", cookiePrefsIntro: "You can decide separately whether to allow analytics cookies. You can change this any time from “Cookie preferences” in the footer.", cookieNecessary: "Necessary cookies", cookieNecessaryText: "They keep the site working, for example by remembering your language and this choice. Always on.", cookieAnalytics: "Analytics cookies", cookieAnalyticsText: "They help us see which pages are useful, using aggregated data and no advertising. Off by default.", cookieContinue: "You can keep browsing without accepting.", cookiePolicyLink: "Read the cookie policy", cookieDismiss: "Close and continue without accepting", reject: "Reject all", accept: "Accept all", cookieSettings: "Cookie preferences",
    languageSuggestion: "This page is available in English.", storageNotice: "Your browser could not save this choice. Analytics will stay off for this visit.",
    photoPending: "Original photography coming soon", verified: "Information checked on [date]", discount: "Exclusive menu",
  },
};
