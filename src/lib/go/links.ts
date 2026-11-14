import type { Locale } from "@/lib/i18n";

// Printed QR codes point at /go/{code}/{channel}/ and never change. Where a code leads is decided here, so a poster
// can stay on the wall while the offer behind it moves. A code names a restaurant page, not a single menu, because a
// poster may advertise several menus at once.
export type GoLink = { placeId: string; until?: string };
export const goLinks: Record<string, GoLink> = {
  pastation: { placeId: "restaurant-1" },
};

const channelPattern = /^[a-z0-9-]{1,24}$/;

// A channel is a free label for one poster or flyer (p1, window, flyer-may). A malformed one is dropped, never refused.
export function parseGoPath(segments: string[]): { code: string; channel: string; link: GoLink } | null {
  if (segments.length < 1 || segments.length > 2) return null;
  const code = segments[0].toLowerCase(), link = Object.hasOwn(goLinks, code) ? goLinks[code] : undefined;
  if (!link) return null;
  const channel = (segments[1] ?? "").toLowerCase();
  return { code, channel: channelPattern.test(channel) ? channel : "", link };
}

// First language the phone lists that we have a page for; anything else gets English.
export function pickLocale(acceptLanguage: string | null): { locale: Locale; matched: boolean } {
  const ranked = (acceptLanguage ?? "").split(",").map((part, index) => {
    const [tag, ...params] = part.trim().split(";"), q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, index };
  }).filter((entry) => entry.tag && entry.q > 0).sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "zh" || base === "it" || base === "en") return { locale: base, matched: true };
  }
  return { locale: "en", matched: false };
}

export function isExpired(link: GoLink, now = new Date()): boolean {
  return Boolean(link.until) && now.toISOString().slice(0, 10) > link.until!;
}

// Link-preview fetchers and crawlers open a link without a person behind it; they are sent on but not counted.
export function isAutomated(userAgent: string | null, method: string): boolean {
  return method !== "GET" || !userAgent || /bot|crawl|spider|preview|slurp|facebookexternalhit|whatsapp|telegram|curl|wget|headless/i.test(userAgent);
}

export async function recordGoScan(scan: { code: string; channel: string; language: Locale; matched: boolean }, config: { url?: string; secretKey?: string }, transport: typeof fetch = fetch): Promise<boolean> {
  try {
    const origin = new URL(config.url ?? "");
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash || !/^sb_secret_[A-Za-z0-9_-]+$/.test(config.secretKey ?? "")) return false;
    const response = await transport(new URL("/rest/v1/rpc/pci_record_go_scan", origin), {
      method: "POST", headers: { apikey: config.secretKey!, "Content-Type": "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(1500),
      body: JSON.stringify({ p_code: scan.code, p_channel: scan.channel, p_language: scan.language, p_picked: scan.matched ? "browser" : "default" }),
    });
    return response.ok;
  } catch { return false; }
}
