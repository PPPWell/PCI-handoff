import type { NextConfig } from "next";

import { imageOrigin } from "./src/lib/catalog/image-origin";

const publicImageOrigin = imageOrigin(process.env.R2_PUBLIC_ORIGIN);
const config: NextConfig = {
  experimental: { globalNotFound: true },
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  images: {
    // AVIF first (about a quarter smaller than WebP), WebP for browsers without it. Optimised copies are kept for 31 days:
    // a photo that changes gets a new file name, so a long cache never shows a stale image.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
    remotePatterns: publicImageOrigin ? [{ protocol: "https", hostname: new URL(publicImageOrigin).hostname, port: new URL(publicImageOrigin).port, pathname: "/**" }] : [],
  },
  // Site-wide: no framing by other sites (the merchant redeem buttons must not be clickjacked; same origin stays allowed
  // for scripts/layout-audit.js), no MIME sniffing, camera only for our
  // own scanner. Referrer-Policy stays per path in the proxy, where coupon and account pages send none at all.
  async headers() {
    // Fonts never change under the same name; photos rarely do and get a new name when they do.
    const year = "public, max-age=31536000, immutable", week = "public, max-age=604800, stale-while-revalidate=86400";
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }, { key: "Content-Type", value: "text/javascript; charset=utf-8" }] },
      { source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: year }] },
      { source: "/images/:path*", headers: [{ key: "Cache-Control", value: week }] },
      { source: "/:path*", headers: [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
    ] }];
  },
  async redirects() {
    // /ristorante is the short address told to restaurant owners and printed on the counter card; not permanent, so it can move later.
    return [{ source: "/", destination: "/zh/", permanent: true }, { source: "/ristorante", destination: "/it/merchant/login/", permanent: false },
      // PaStation was first published under its placeholder slug; old links keep working.
      { source: "/zh/florence/eat/restaurant-1", destination: "/zh/florence/eat/pastation-firenze/", permanent: true },
      { source: "/it/firenze/mangiare/restaurant-1", destination: "/it/firenze/mangiare/pastation-firenze/", permanent: true },
      { source: "/en/florence/eat/restaurant-1", destination: "/en/florence/eat/pastation-firenze/", permanent: true }];
  },
};

export default config;
