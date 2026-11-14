import type { MetadataRoute } from "next";
import { contentMode, siteOrigin } from "@/lib/catalog/seo";
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return contentMode() === "preview" ? { rules: { userAgent: "*", disallow: "/" } } : { rules: { userAgent: "*", allow: "/", disallow: ["/v/", "/go/", "/*/checkout/", "/*/success/", "/*/account/", "/*/merchant/", "/*/subscribe/confirm/", "/*/subscribe/unsubscribe/"] }, ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
