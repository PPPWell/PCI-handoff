import type { Locale } from "./i18n";
export const categoryIds = ["eat", "do", "shop", "stay", "guides"] as const;
export type CategoryId = typeof categoryIds[number];
export const categoryNames: Record<Locale, Record<CategoryId, string>> = {
  zh: { eat: "餐厅", do: "景点", shop: "购物", stay: "住宿", guides: "提示" },
  it: { eat: "Ristoranti", do: "Attrazioni", shop: "Shopping", stay: "Alloggi", guides: "Consigli" },
  en: { eat: "Restaurants", do: "Sights", shop: "Shopping", stay: "Stays", guides: "Tips" },
};

// Register only real pages. Task 02 adds city pages and missing-translation fallback.
export function getLocalizedPath(pageId: string, locale: Locale): string | null {
  return pageId === "home" ? `/${locale}/` : null;
}
/** Categories open to the public. The others keep their tab and show a "coming soon" page, never indexed. */
export const launchedCategories: readonly CategoryId[] = ["eat"];
export const isLaunched = (id: CategoryId) => launchedCategories.includes(id);
/** Every category stays in the navigation, however few places it holds; an empty one shows its own empty state. */
export function getVisibleCategories(): CategoryId[] {
  return [...categoryIds];
}
export function getNavigationMode(categories: CategoryId[]): "horizontal" | "bottom" {
  return categories.length >= 3 ? "bottom" : "horizontal";
}
