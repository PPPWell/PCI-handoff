"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track, CHANNEL_KEY, type AnalyticsEvent } from "@/lib/analytics";

/** Page views and the clicks that matter. Nothing here sends anything by itself: track() drops every event unless analytics is
 * enabled and the visitor accepted it. Clicks are read from data-track attributes and a few known containers, so pages and
 * components stay free of tracking code. Counts that decide money or access (claims, redemptions, subscriptions) come from the
 * database, never from here. */
const pageTypes: Record<string, string> = { city: "city", category: "category", place: "place", guide: "guide", info: "info", offer: "offer", coupon: "coupon" };

export function AnalyticsEvents({ kind, slug }: { kind?: string; slug?: string }) {
  const pathname = usePathname();
  // A poster QR code lands here with ?ch=<label>. The label is kept for this tab only and is used for two things: it rides on analytics
  // events (if accepted), and it is noted on the coupon when one is claimed (a label only, see the privacy policy).
  useEffect(() => {
    try {
      const channel = new URLSearchParams(window.location.search).get("ch");
      if (channel && /^[a-z0-9-]{1,24}$/.test(channel)) window.sessionStorage.setItem(CHANNEL_KEY, channel);
    } catch { /* sessionStorage can be blocked */ }
  }, []);
  useEffect(() => {
    const type = kind ? pageTypes[kind] ?? kind : pathname.split("/").filter(Boolean).length <= 1 ? "home" : "other";
    track("page_viewed", { page_type: type });
    if (kind === "place" && slug) track("place_viewed", { place: slug });
    if (kind === "guide" && slug) track("guide_viewed", { guide: slug });
  }, [pathname, kind, slug]);
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const tagged = target?.closest<HTMLElement>("[data-track]");
      if (tagged) {
        const { track: name, trackItem } = tagged.dataset;
        track(name as AnalyticsEvent, trackItem ? { item: trackItem } : {});
        return;
      }
      const link = target?.closest("a");
      if (!link) return;
      const area = link.closest(".bottom-nav") ? "bottom" : link.closest(".site-footer") ? "footer" : link.closest(".language-dropdown") ? "language" : link.closest(".header-inner") ? "header" : "";
      if (area === "language") track("language_switched", { to: link.getAttribute("hreflang") ?? "" });
      else if (area) track("nav_clicked", { area });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
