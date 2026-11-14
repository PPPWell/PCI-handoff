import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { isLocale, type Locale } from "./i18n";

export interface HomeContent {
  locale: Locale;
  seo: { title: string; description: string };
  hero: { eyebrow: string; title: string; description: string; imageAlt: string };
  doors: { heading: string; notes: Record<"eat" | "do" | "shop" | "stay" | "guides", string> };
  offer: { heading: string; restaurant: string; name: string; price: string; comparison: string; description: string; includes: string; status: string; notify: string; imageLabel: string };
  city: { heading: string; name: string; originalName: string; counts: string; action: string; upcomingTitle: string; upcoming: string; notify: string };
  tips: { heading: string; items: string[] };
  team: { heading: string; description: string; action: string; places: { title: string; detail: string; imageLabel: string }[] };
  subscribe: { title: string; description: string; label: string; button: string; closed: string };
  footer: { description: string; company: string };
}

const required = {
  seo: ["title", "description"],
  hero: ["eyebrow", "title", "description", "imageAlt"],
  doors: ["heading"],
  offer: ["heading", "restaurant", "name", "price", "comparison", "description", "includes", "status", "notify", "imageLabel"],
  city: ["heading", "name", "originalName", "counts", "action", "upcomingTitle", "upcoming", "notify"],
  tips: ["heading"], team: ["heading", "description", "action"],
  subscribe: ["title", "description", "label", "button", "closed"], footer: ["description", "company"],
};

export function validateHomeContent(input: unknown, source: string): asserts input is HomeContent {
  const fail = (path: string): never => { throw new Error(`${source}: missing or invalid ${path}`); };
  if (!input || typeof input !== "object") fail("document");
  const content = input as Record<string, unknown>;
  if (typeof content.locale !== "string" || !isLocale(content.locale)) fail("locale");
  for (const [section, fields] of Object.entries(required)) {
    const value = content[section];
    if (!value || typeof value !== "object") fail(section);
    for (const field of fields) {
      const text = (value as Record<string, unknown>)[field];
      if (typeof text !== "string" || !text.trim()) fail(`${section}.${field}`);
    }
  }
  const notes = (content.doors as Record<string, unknown>).notes as Record<string, unknown> | undefined;
  for (const id of ["eat", "do", "shop", "stay", "guides"]) if (typeof notes?.[id] !== "string" || !String(notes[id]).trim()) fail(`doors.notes.${id}`);
  const tips = content.tips as Record<string, unknown>;
  if (!Array.isArray(tips.items) || !tips.items.length) fail("tips.items");
  for (const [index, item] of (tips.items as unknown[]).entries()) {
    if (typeof item !== "string" || !item.trim()) fail(`tips.items[${index}]`);
  }
  const team = content.team as Record<string, unknown>;
  if (!Array.isArray(team.places) || !team.places.length) fail("team.places");
  for (const [index, place] of (team.places as unknown[]).entries()) {
    for (const field of ["title", "detail", "imageLabel"]) {
      const value = place && typeof place === "object" ? (place as Record<string, unknown>)[field] : null;
      if (typeof value !== "string" || !value.trim()) fail(`team.places[${index}].${field}`);
    }
  }
}

export function getHomeContent(locale: Locale): HomeContent {
  const source = join("content", "home", `${locale}.yaml`);
  const content: unknown = parse(readFileSync(join(process.cwd(), source), "utf8"));
  validateHomeContent(content, source);
  if (content.locale !== locale) throw new Error(`${source}: locale does not match its filename`);
  return content;
}

export function getPreviewNavigationCounts(): Record<string, number> {
  const source = "content/preview/navigation.yaml";
  const data = parse(readFileSync(join(process.cwd(), source), "utf8"));
  if (data.mode !== "preview") throw new Error(`${source}: expected explicitly marked preview data`);
  return data.counts;
}
