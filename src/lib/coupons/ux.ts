import type { Locale } from "../i18n";
import type { Offer } from "../catalog/types";
/** A coupon's validity as the content defines it: in days or in months. */
export type Validity = { days?: number; months?: number };

export interface CouponPricing { menuCents: number; couponCents: number; saveCents: number; menu: string; coupon: string; save: string }

const intlLocale = (locale: Locale) => (locale === "zh" ? "zh-CN" : locale === "it" ? "it-IT" : "en-IE");

export function euro(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** Reference menu price → coupon price → saving, from the offer's fixed amount and provisional reference price. */
export function couponPricing(offer: Pick<Offer, "benefit">, locale: Locale): CouponPricing | null {
  const benefit = offer.benefit;
  if (!benefit?.reference) return null;
  const menuCents = benefit.reference.menuPriceCents;
  const couponCents = Math.max(0, menuCents - benefit.discountCents);
  const saveCents = menuCents - couponCents;
  return { menuCents, couponCents, saveCents, menu: euro(menuCents, locale), coupon: euro(couponCents, locale), save: euro(saveCents, locale) };
}

/** Names of the menus a coupon covers, e.g. "豪华午餐 1". Same text on the real coupon and on the preview. */
export function couponIncludes(offer: Pick<Offer, "translations">, locale: Locale): string {
  return offer.translations[locale].courses.map((course) => course.name).join(" / ");
}

const mealNames = { zh: { lunch: "午餐", dinner: "晚餐" }, it: { lunch: "Pranzo", dinner: "Cena" }, en: { lunch: "Lunch", dinner: "Dinner" } } as const;
export type MealWindow = NonNullable<Offer["mealWindows"]>[number];

/** "午餐 12:00–13:00、晚餐 15:00–22:30（意大利当地时间）": the Italian local times a menu can be eaten in. */
export function mealWindowLabel(windows: readonly MealWindow[], locale: Locale): string {
  const ranges = windows.map((w) => `${mealNames[locale][w.meal]} ${w.from}–${w.to}`);
  return locale === "zh" ? `${ranges.join("、")}（意大利当地时间）` : `${ranges.join(" · ")} · ${locale === "it" ? "ora italiana" : "Italian local time"}`;
}

/** The Italian-time note that follows a time range. */
export const italianTimeNote: Record<Locale, string> = { zh: "（意大利当地时间）", it: " · ora italiana", en: " · Italian local time" };

/** Whole days from today (Rome) to the last valid day; 0 means it ends today. */
export function daysLeft(serverNow: string, expiresOn: string): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(serverNow));
  return Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
}
export function daysLeftLabel(days: number, locale: Locale): string {
  if (days <= 0) return locale === "zh" ? "今天到期" : locale === "it" ? "Scade oggi" : "Expires today";
  return locale === "zh" ? `还剩 ${days} 天` : locale === "it" ? `Ancora ${days} ${days === 1 ? "giorno" : "giorni"}` : `${days} ${days === 1 ? "day" : "days"} left`;
}

/** Rome clock "HH:MM" for an instant. */
export function romeClock(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

export type MealNow = { state: "open"; meal: MealWindow["meal"]; until: string } | { state: "later"; meal: MealWindow["meal"]; from: string } | { state: "tomorrow"; meal: MealWindow["meal"]; from: string };

/** Whether a menu can be eaten right now (Italian time), and if not, when the next window opens. */
export function mealWindowNow(windows: readonly MealWindow[], at: Date): MealNow | null {
  if (!windows.length) return null;
  const now = romeClock(at), sorted = [...windows].sort((a, b) => a.from.localeCompare(b.from));
  const open = sorted.find((w) => w.from <= now && now < w.to);
  if (open) return { state: "open", meal: open.meal, until: open.to };
  const next = sorted.find((w) => now < w.from);
  return next ? { state: "later", meal: next.meal, from: next.from } : { state: "tomorrow", meal: sorted[0].meal, from: sorted[0].from };
}

/** "现在可以使用，晚餐到 22:30" and friends; on the last valid day "tomorrow" becomes "today's windows are over". */
export function mealNowLabel(status: MealNow, locale: Locale, lastDay = false): string {
  const meal = mealNames[locale][status.meal], lower = locale === "zh" ? meal : meal.toLowerCase();
  if (status.state === "open") return locale === "zh" ? `现在可以使用，${meal}到 ${status.until}` : locale === "it" ? `Utilizzabile adesso, ${lower} fino alle ${status.until}` : `Usable now, ${lower} until ${status.until}`;
  if (status.state === "later") return locale === "zh" ? `现在不在可用时段，${meal} ${status.from} 开始` : locale === "it" ? `Non utilizzabile adesso: ${lower} dalle ${status.from}` : `Not usable right now: ${lower} from ${status.from}`;
  if (lastDay) return locale === "zh" ? "今天的可用时段已过" : locale === "it" ? "Gli orari di oggi sono terminati" : "Today's times are over";
  return locale === "zh" ? `今天的可用时段已过，明天${meal} ${status.from} 开始` : locale === "it" ? `Orari di oggi terminati: domani ${lower} dalle ${status.from}` : `Done for today: ${lower} tomorrow from ${status.from}`;
}
export const romeClockLabel: Record<Locale, string> = { zh: "意大利时间", it: "Ora italiana", en: "Italian time" };

/** Reads the meal windows back out of the Italian window text frozen on a coupon ("Pranzo 12:00–13:00 · Cena 15:00–22:30 · ora italiana"). */
export function frozenMealWindows(text: string | undefined): MealWindow[] {
  if (!text) return [];
  return [...text.matchAll(/(Pranzo|Cena) (\d{2}:\d{2})–(\d{2}:\d{2})/g)].map((m) => ({ meal: m[1] === "Pranzo" ? "lunch" : "dinner", from: m[2], to: m[3] }) as MealWindow);
}

/** Rome clock with seconds, for the live time on the staff success card. */
export function romeClockSeconds(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(at);
}

/** The staff card's time line: in the window, or the big "outside the times" warning (staff still decide). */
export function staffWindowLine(status: MealNow): { open: boolean; word: string; line: string } {
  const meal = status.meal === "lunch" ? "pranzo" : "cena";
  if (status.state === "open") return { open: true, word: "", line: `In orario · ${meal} fino alle ${status.until}` };
  return { open: false, word: "FUORI ORARIO", line: status.state === "later" ? `Il coupon vale a ${meal} dalle ${status.from}.` : "Gli orari del coupon per oggi sono terminati." };
}

/** What a campaign freezes onto every coupon; the same shape feeds the setup SQL and the preview page. */
export type FrozenCopy = { name: string; conditions: string; menu: string; window?: string; list?: string; pay?: string };
export function couponTranslations(offer: Offer): Record<Locale, FrozenCopy> {
  return Object.fromEntries((["zh", "it", "en"] as const).map((l) => {
    const pricing = couponPricing(offer, l);
    return [l, { name: offer.translations[l].name, conditions: offer.translations[l].conditions, menu: couponIncludes(offer, l), ...(offer.mealWindows?.length ? { window: mealWindowLabel(offer.mealWindows, l) } : {}), ...(pricing ? { list: pricing.menu, pay: pricing.coupon } : {}) }];
  })) as Record<Locale, FrozenCopy>;
}

/** Short labels over the three numbers on a menu card. */
export const figureLabels: Record<Locale, { list: string; pay: string; save: string }> = {
  zh: { list: "标价", pay: "凭券", save: "立省" },
  it: { list: "Listino", pay: "Con coupon", save: "Risparmi" },
  en: { list: "List price", pay: "With coupon", save: "You save" },
};

/** One line for cards and bars: "€25 → €18 · 省 €8". Null when the offer has no reference price. */
export function priceLine(offer: Pick<Offer, "benefit">, locale: Locale): string | null {
  const p = couponPricing(offer, locale);
  if (!p) return null;
  return locale === "zh" ? `标价 ${p.menu} → 凭券 ${p.coupon}，省 ${p.save}` : locale === "it" ? `Da ${p.menu} a ${p.coupon}: risparmi ${p.save}` : `${p.menu} → ${p.coupon} with the coupon, save ${p.save}`;
}

/** Minus sign and amount: "−€8" / "−8 €" (Italian writes the euro sign after the number). */
export function discountAmount(discountCents: number, locale: Locale = "it"): string {
  return `−${euro(discountCents, locale)}`;
}
/** Short discount label: "立减 €8" / "Sconto 8 €" / "€8 off". */
export function discountLabel(discountCents: number, locale: Locale): string {
  const amount = euro(discountCents, locale);
  return locale === "zh" ? `立减 ${amount}` : locale === "it" ? `Sconto ${amount}` : `${amount} off`;
}

/** Six-digit staff code as typed or read aloud: 482 915. */
/** "PaStation Menù Deluxe 1 · coupon da 8 €" → "Menù Deluxe 1": the campaign name without the restaurant and the coupon suffix, for staff lists. */
export function shortMenuName(name: string, restaurant?: string | null): string {
  let short = name.replace(/\s+·\s+coupon\b.*$/i, "").trim();
  if (restaurant && short.toLowerCase().startsWith(restaurant.toLowerCase() + " ")) short = short.slice(restaurant.length).trim();
  const first = restaurant?.split(/\s+/)[0];
  if (first && short.toLowerCase().startsWith(first.toLowerCase() + " ") && /^men[uù](?=\s|$)/i.test(short.slice(first.length).trim())) short = short.slice(first.length).trim();
  return short || name;
}

export function spacedCode(code: string | null): string { return code ? code.replace("-", " ") : ""; }

/** Normalise keypad input to NNN-NNN while typing. */
export function formatCodeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
}

export function formatDay(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", dateStyle: "long" }).format(new Date(`${day}T12:00:00Z`));
}
export function formatRomeTime(instant: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Rome", dateStyle: "medium", timeStyle: "short" }).format(new Date(instant));
}

const zh = {
  claim: "免费领取优惠券",
  claimNote: "领取时验证邮箱，约一分钟；验证邮箱不会订阅营销邮件。",
  free: "免费领取",
  payAtRestaurant: "餐费到店支付",
  onceOnly: "每张券核销一次",
  validity: (v: Validity) => v.days ? `领取后 ${v.days} 天内有效` : `领取后 ${v.months} 个月内有效`,
  priceHeading: "这张券能省多少",
  menuPrice: "套餐标价",
  couponPrice: "凭券价",
  youSave: "立省",
  priceNote: "请在对应套餐的就餐时段到店使用。",
  includes: "套餐内容",
  window: "就餐时段",
  stepsHeading: "怎么用",
  steps: ["免费领取并保存这张券。", "到店点券上对应的套餐前，把券出示给店员。", "店员核销后享折扣，餐费直接付给餐厅。"],
  dialogTitle: "验证邮箱，领取优惠券",
  dialogClose: "关闭",
  claiming: "正在领取…",
  successTitle: "领取成功",
  successBody: "券已存进个人中心（右上角）。到店点这个套餐时，出示给店员。",
  showToStaff: "出示给店员",
  openCoupon: "查看这张券",
  findLater: "以后可点右上角账户图标，在“我的券”里找到",
  subscribeTitle: "想收到新套餐和活动吗？（可选）",
  couponHeading: "优惠券",
  validUntil: "有效期至",
  statusLabel: "状态",
  codeLabel: "短码",
  saveImage: "保存二维码图片",
  closePresent: "返回券面",
  presentHint: "把手机交给店员扫码。扫不了时，店员可以输入上面的 6 位短码。",
  brightness: "请把屏幕调亮，并保持此页面打开。",
};
const it: typeof zh = {
  claim: "Richiedi il coupon gratuito",
  claimNote: "Verifichi l’email in circa un minuto; la verifica non ti iscrive alle comunicazioni promozionali.",
  free: "Gratuito",
  payAtRestaurant: "Il pasto si paga al ristorante",
  onceOnly: "Una sola convalida per coupon",
  validity: (v: Validity) => v.days ? `Valido ${v.days} giorni dalla richiesta` : `Valido ${v.months} mesi dalla richiesta`,
  priceHeading: "Quanto risparmi",
  menuPrice: "Prezzo di riferimento del menù",
  couponPrice: "Prezzo con coupon",
  youSave: "Risparmi",
  priceNote: "Prezzo di riferimento: contano il menù e il conto del ristorante.",
  includes: "Cosa include",
  window: "Orario",
  stepsHeading: "Come funziona",
  steps: ["Richiedi e conserva il coupon gratuito.", "Mostralo allo staff prima di ordinare il menù indicato sul coupon.", "Lo staff lo convalida e applica lo sconto; paghi al ristorante."],
  dialogTitle: "Verifica l’email e richiedi il coupon",
  dialogClose: "Chiudi",
  claiming: "Richiesta in corso…",
  successTitle: "Coupon richiesto",
  successBody: "Il coupon è nel tuo account (in alto a destra). Mostralo allo staff quando ordini questo menù.",
  showToStaff: "Mostra allo staff",
  openCoupon: "Apri il coupon",
  findLater: "Lo trovi anche in “I miei coupon”",
  subscribeTitle: "Vuoi ricevere novità e nuovi menù? (facoltativo)",
  couponHeading: "Coupon",
  validUntil: "Valido fino al",
  statusLabel: "Stato",
  codeLabel: "Codice",
  saveImage: "Salva l’immagine del QR",
  closePresent: "Torna al coupon",
  presentHint: "Consegna il telefono allo staff. Se il QR non si legge, può digitare il codice di 6 cifre qui sopra.",
  brightness: "Aumenta la luminosità e tieni aperta la pagina.",
};
const en: typeof zh = {
  claim: "Get the free coupon",
  claimNote: "You verify your email in about a minute; verifying does not subscribe you to marketing email.",
  free: "Free",
  payAtRestaurant: "Pay for your meal at the restaurant",
  onceOnly: "One redemption per coupon",
  validity: (v: Validity) => v.days ? `Valid for ${v.days} days after claiming` : `Valid for ${v.months} months after claiming`,
  priceHeading: "What you save",
  menuPrice: "Menu reference price",
  couponPrice: "Price with coupon",
  youSave: "You save",
  priceNote: "Reference price; the restaurant's menu and bill apply.",
  includes: "What's included",
  window: "Eat between",
  stepsHeading: "How it works",
  steps: ["Claim and keep the free coupon.", "Show it to staff before ordering the menu named on it.", "Staff redeem it and apply the discount; you pay at the restaurant."],
  dialogTitle: "Verify your email to claim",
  dialogClose: "Close",
  claiming: "Claiming…",
  successTitle: "Coupon claimed",
  successBody: "The coupon is in your account (top right). Show it to staff when you order this menu.",
  showToStaff: "Show to staff",
  openCoupon: "Open the coupon",
  findLater: "You can also find it under My coupons",
  subscribeTitle: "Want news about new menus and events? (optional)",
  couponHeading: "Coupon",
  validUntil: "Valid until",
  statusLabel: "Status",
  codeLabel: "Code",
  saveImage: "Save QR image",
  closePresent: "Back to coupon",
  presentHint: "Hand the phone to staff. If the QR will not scan, they can type the 6-digit code above.",
  brightness: "Turn the brightness up and keep this page open.",
};
export const claimCopy: Record<Locale, typeof zh> = { zh, it, en };

/** Text shown to restaurant staff is always Italian, whatever language the customer reads. */
export const staffCopy = {
  kicker: "Coupon sconto",
  menuLine: "Sconto sul menù indicato",
  window: "Orario",
  toPay: "Da pagare",
  payLine: "Pagamento al ristorante",
  showBefore: "Mostrare allo staff prima di ordinare.",
  validUntil: "Valido fino al",
  code: "Codice",
  howTo: "Staff: inquadrate il QR oppure inserite il codice nell’area ristorante.",
  valid: "VALIDO",
  used: "GIÀ USATO",
  expired: "SCADUTO",
  unavailable: "NON DISPONIBILE",
  usedAt: "Convalidato il",
  redeem: "Convalidate",
  redeemAnyway: "Convalidate comunque",
  outsideHint: "Decide il ristorante: se accettate il cliente fuori orario, convalidate comunque.",
  doneAt: "Convalidato alle",
  liveClock: "Ora attuale",
  cancel: "Indietro",
  scanBack: "Tornate alla scansione",
  redeemWorking: "Convalida in corso…",
  doneTitle: "CONVALIDATO",
  doneBody: "Applicate lo sconto al menù indicato.",
  undo: "Annullate la convalida",
  undoNote: "Convalidato per errore? Potete annullare entro due minuti.",
  scanNext: "Scansionate il prossimo",
  backToday: "Tornate a Oggi",
  lookupNext: "Cercate un altro codice",
  undoneTitle: "ANNULLATO",
  undoneBody: "La convalida è stata annullata. Il coupon torna utilizzabile.",
  wrongHint: "Se il coupon non risulta, potrebbe essere di un altro ristorante.",
  retry: "Esito non confermato. Verificate la stessa richiesta senza iniziare un’altra convalida.",
  retryButton: "Verificate la stessa richiesta",
  collect: "Incassate",
  expires: "scade il",
  details: "Condizioni del coupon",
  otherTitle: "ALTRO LOCALE",
  otherBody: (name: string) => `Questo coupon è di ${name}. Non convalidatelo qui.`,
  autoBack: (s: number) => `Torno alla fotocamera tra ${s} s`,
  stay: "Restate qui",
  undoElsewhere: "Annullabile solo dal telefono che l’ha convalidato.",
};

/** The restaurant's own online booking page: button label and the reminder to book inside the coupon's meal windows. */
export const bookingCopy: Record<Locale, { label: string; note: (windows: string) => string }> = {
  zh: { label: '在线订位', note: (w) => `订位页是意大利语和英语。请选在用券时段内：${w}` },
  it: { label: 'Prenota online', note: (w) => `Il modulo è in italiano e inglese. Scegliete un orario in cui il coupon è valido: ${w}` },
  en: { label: 'Book online', note: (w) => `The booking page is in Italian and English. Pick a time when the coupon is valid: ${w}` },
};
