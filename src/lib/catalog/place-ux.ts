import type { Locale } from "../i18n";

/** Visitor-facing strings for the restaurant page extras: nearby, copy address, dishes, order cheat sheet. */
export const placeUx = {
  zh: {
    visit: "到店", nearby: "步行可达", approx: "步行约", minutes: "分钟", nearbyNote: "步行时间为估算，出发前请以地图为准。",
    copyAddress: "复制意大利语地址", copied: "已复制", copyPhrase: "复制", openApple: "Apple 地图", openGoogle: "Google 地图",
    dishesTitle: "菜品一览", dishesNote: "具体品种以店内合作套餐菜单为准。", vegetarian: "素食", vegetarianUnknown: "是否素食：请问店员", allergenUnknown: "过敏原：请向店员确认",
    cheatTitle: "点餐小抄", cheatLead: "点“复制”，或直接给店员看。", saveLine: "凭券立减 €8，餐费到店支付。",
  },
  it: {
    visit: "Come arrivare", nearby: "A due passi da", approx: "A piedi circa", minutes: "min", nearbyNote: "Tempi stimati a piedi: controlla sulla mappa prima di partire.",
    copyAddress: "Copia l’indirizzo", copied: "Copiato", copyPhrase: "Copia", openApple: "Apple Maps", openGoogle: "Google Maps",
    dishesTitle: "I piatti", dishesNote: "I dettagli seguono il menù convenzionato in sala.", vegetarian: "Vegetariano", vegetarianUnknown: "Vegetariano: chiedi allo staff", allergenUnknown: "Allergeni: chiedi allo staff",
    cheatTitle: "Frasi utili per ordinare", cheatLead: "Tocca per copiare o mostra lo schermo allo staff.", saveLine: "Sconto con il coupon; si paga al ristorante.",
  },
  en: {
    visit: "Getting there", nearby: "Nearby", approx: "About", minutes: "min walk", nearbyNote: "Walking times are estimates; check the map before you set off.",
    copyAddress: "Copy address", copied: "Copied", copyPhrase: "Copy", openApple: "Apple Maps", openGoogle: "Google Maps",
    dishesTitle: "The dishes", dishesNote: "Details follow the partner menu in the restaurant.", vegetarian: "Vegetarian", vegetarianUnknown: "Vegetarian: ask staff", allergenUnknown: "Allergens: ask staff",
    cheatTitle: "Order cheat sheet", cheatLead: "Tap to copy, or show your screen to the staff.", saveLine: "Discount with the coupon; pay at the restaurant.",
  },
} satisfies Record<Locale, Record<string, string>>;

/** Italian lines a visitor can say or show, each with a gloss in the page language. */
export const orderPhrases: { it: string; gloss: Record<Locale, string> }[] = [
  { it: "Buongiorno, ho un coupon di Palazzo Italia-Cina.", gloss: { zh: "您好，我有一张中意公馆的优惠券。", it: "Saluto e coupon.", en: "Hello, I have a Palazzo Italia-Cina coupon." } },
  { it: "Vorrei il menù Deluxe, per favore.", gloss: { zh: "我想点豪华套餐。", it: "Ordino il menù Deluxe.", en: "I'd like the Deluxe menu, please." } },
  { it: "Posso mostrarvi il coupon prima di ordinare?", gloss: { zh: "点单前可以先给您看券吗？", it: "Mostro il coupon prima.", en: "May I show the coupon before ordering?" } },
  { it: "Ho un’allergia: cosa contiene questo piatto?", gloss: { zh: "我有过敏：这道菜含什么？", it: "Chiedo gli allergeni.", en: "I have an allergy: what is in this dish?" } },
  { it: "Il conto, per favore. Posso pagare con la carta?", gloss: { zh: "请结账，可以刷卡吗？", it: "Conto e carta.", en: "The bill please. Can I pay by card?" } },
];
