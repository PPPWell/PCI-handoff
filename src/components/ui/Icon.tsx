import type { SVGProps } from "react";

export type IconName = "eat" | "do" | "shop" | "stay" | "guides" | "globe" | "account" | "menu" | "close" | "arrow" | "pin" | "check" | "chevron" | "scan" | "list" | "store" | "keypad" | "torch" | "alert" | "phone";
const paths: Record<IconName, React.ReactNode> = {
  eat: <><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /></>,
  do: <><circle cx="10" cy="10" r="7" /><path d="m10 5 3 5-3 5-3-5 3-5Z" /></>,
  shop: <><path d="M4 7h12l-1 10H5L4 7Z" /><path d="M7 7V5a3 3 0 0 1 6 0v2" /></>,
  stay: <><path d="m3 9 7-6 7 6v8H3V9Z" /><path d="M8 17v-5h4v5" /></>,
  guides: <><path d="M3 3h14v14H3zM8 3v14M11 7h3M11 10h3" /></>,
  globe: <><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3a14 14 0 0 1 0 14 14 14 0 0 1 0-14Z" /></>,
  account: <><circle cx="10" cy="6" r="3" /><path d="M4 17a6 6 0 0 1 12 0" /></>,
  menu: <path d="M3 5h14M3 10h14M3 15h14" />,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  arrow: <path d="M3 10h13m-5-5 5 5-5 5" />,
  pin: <><path d="M16 8c0 5-6 9-6 9S4 13 4 8a6 6 0 0 1 12 0Z" /><circle cx="10" cy="8" r="2" /></>,
  chevron: <path d="m5 7 5 5 5-5" />,
  check: <path d="m4 10 4 4 8-8" />,
  scan: <><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /><path d="M6 10h8" /></>,
  list: <path d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01" />,
  store: <><path d="M3 8 4.5 3h11L17 8M3 8h14M3 8v9h14V8" /><path d="M8 17v-5h4v5" /></>,
  keypad: <><circle cx="5" cy="4" r=".8" /><circle cx="10" cy="4" r=".8" /><circle cx="15" cy="4" r=".8" /><circle cx="5" cy="9" r=".8" /><circle cx="10" cy="9" r=".8" /><circle cx="15" cy="9" r=".8" /><circle cx="5" cy="14" r=".8" /><circle cx="10" cy="14" r=".8" /><circle cx="15" cy="14" r=".8" /><circle cx="10" cy="18" r=".8" /></>,
  torch: <><path d="M7 2h6v4l-2 3v9H9V9L7 6V2Z" /><path d="M7 6h6" /></>,
  alert: <><path d="M10 3 2 17h16L10 3Z" /><path d="M10 8v4M10 14.5h.01" /></>,
  phone: <><rect x="6" y="2" width="8" height="16" rx="1.5" /><path d="M9.5 15h1" /></>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
