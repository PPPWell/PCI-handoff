import type { CategoryId } from "@/lib/routes";

/** Flat illustrations in the brand palette (design tokens only). Decorative: always aria-hidden. */

/** One small scene per section, 160 x 100. */
export function DoorArt({ id }: { id: CategoryId }) {
  return <svg className="door__art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">{scenes[id]}</svg>;
}

const scenes: Record<CategoryId, React.ReactNode> = {
  /* 餐厅: a plate with farfalle, a tomato, a fork and a glass of red wine */
  eat: <>
    <rect width="160" height="100" fill="var(--brass-100)" />
    <path d="M0 78h160v22H0Z" fill="var(--brass-200)" />
    <path d="M0 78h160" stroke="var(--brass-300)" strokeWidth="2" />
    <circle cx="80" cy="54" r="34" fill="var(--stone-50)" stroke="var(--stone-300)" strokeWidth="1.5" />
    <circle cx="80" cy="54" r="25" fill="var(--stone-100)" />
    <path d="M62 46l18 8-18 8Z M98 46L80 54l18 8Z" fill="var(--brass-500)" />
    <circle cx="80" cy="54" r="4.5" fill="var(--brass-600)" />
    <circle cx="98" cy="40" r="6.5" fill="var(--danger)" /><path d="M98 33q4-4 8-2-3 4-8 2Z" fill="var(--olive-600)" />
    <rect x="30" y="34" width="3" height="40" rx="1.5" fill="var(--stone-400)" /><path d="M26 34v9a5 5 0 0 0 10 0v-9" stroke="var(--stone-400)" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M122 30h16l-1 18q-7 6-14 0Z" fill="var(--danger)" opacity=".85" /><path d="M122 30h16l-.4 6h-15.2Z" fill="var(--stone-50)" opacity=".5" />
    <rect x="129" y="48" width="2" height="22" fill="var(--stone-400)" /><ellipse cx="130" cy="71" rx="8" ry="2" fill="var(--stone-400)" />
  </>,
  /* 景点: the dome of Florence cathedral and its bell tower */
  do: <>
    <rect width="160" height="100" fill="var(--olive-100)" />
    <circle cx="128" cy="24" r="12" fill="var(--brass-200)" />
    <path d="M14 30q10-8 24-3t22-3q-4 8-16 7T14 30Z" fill="var(--stone-50)" opacity=".9" />
    <path d="M0 84q40-14 80-6t80-8V100H0Z" fill="var(--olive-300)" />
    <rect x="24" y="68" width="92" height="16" fill="var(--stone-100)" /><path d="M24 68h92" stroke="var(--stone-300)" strokeWidth="2" />
    <path d="M42 68V56a28 28 0 0 1 56 0v12Z" fill="var(--danger)" />
    <path d="M70 68V30M60 66q-2-22 10-36M80 66q2-22-10-36M50 66q-2-16 6-28M90 66q2-16-6-28" stroke="var(--stone-50)" strokeWidth="1.2" opacity=".55" fill="none" />
    <rect x="66" y="20" width="8" height="11" fill="var(--stone-100)" /><path d="M65 20l5-9 5 9Z" fill="var(--danger)" /><circle cx="70" cy="9" r="2" fill="var(--brass-500)" />
    <rect x="118" y="28" width="16" height="56" fill="var(--stone-100)" /><rect x="116" y="26" width="20" height="5" fill="var(--danger)" />
    {[38, 52, 66].map((y) => <rect key={y} x="123" y={y} width="6" height="8" rx="3" fill="var(--olive-700)" />)}
  </>,
  /* 购物: a tote bag, a bottle of olive oil and a lemon */
  shop: <>
    <rect width="160" height="100" fill="var(--stone-200)" />
    <path d="M0 80h160v20H0Z" fill="var(--stone-300)" />
    <path d="M62 36q0-20 18-20t18 20" stroke="var(--olive-800)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    <path d="M52 36h56l5 50H47Z" fill="var(--olive-600)" /><path d="M52 36h56l1 8H51Z" fill="var(--olive-700)" />
    <rect x="68" y="54" width="24" height="18" rx="2" fill="var(--brass-300)" /><path d="M72 60h16M72 66h10" stroke="var(--brass-600)" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="120" y="42" width="14" height="44" rx="3" fill="var(--olive-800)" /><rect x="124" y="30" width="6" height="14" fill="var(--olive-700)" /><rect x="123" y="26" width="8" height="5" rx="1" fill="var(--brass-500)" /><rect x="122" y="56" width="10" height="14" fill="var(--brass-200)" />
    <ellipse cx="30" cy="74" rx="14" ry="11" fill="var(--brass-300)" /><path d="M30 63q6-6 12-3-3 6-12 3Z" fill="var(--olive-500)" /><path d="M20 70q4-5 10-5" stroke="var(--brass-100)" strokeWidth="2" fill="none" strokeLinecap="round" />
  </>,
  /* 住宿: a shuttered window with a flower box, at dusk */
  stay: <>
    <rect width="160" height="100" fill="var(--olive-800)" />
    <circle cx="132" cy="22" r="9" fill="var(--brass-100)" /><circle cx="136" cy="19" r="8" fill="var(--olive-800)" />
    {[[24, 20], [40, 40], [20, 66], [142, 56], [124, 80]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" fill="var(--brass-300)" />)}
    <rect x="30" y="12" width="100" height="88" fill="var(--olive-700)" />
    <path d="M56 84V38a24 24 0 0 1 48 0v46Z" fill="var(--brass-200)" /><path d="M62 84V40a18 18 0 0 1 36 0v44Z" fill="var(--brass-100)" />
    <rect x="79" y="22" width="2" height="62" fill="var(--olive-700)" /><rect x="56" y="50" width="48" height="2" fill="var(--olive-700)" />
    <rect x="34" y="30" width="18" height="54" fill="var(--olive-500)" /><rect x="108" y="30" width="18" height="54" fill="var(--olive-500)" />
    {[38, 46, 54, 62, 70, 78].map((y) => <g key={y}><path d={`M36 ${y}h14`} stroke="var(--olive-700)" strokeWidth="1" /><path d={`M110 ${y}h14`} stroke="var(--olive-700)" strokeWidth="1" /></g>)}
    <rect x="50" y="84" width="60" height="9" fill="var(--brass-500)" />
    {[56, 68, 80, 92, 104].map((x) => <circle key={x} cx={x} cy="80" r="5" fill="var(--olive-400)" />)}
    {[62, 86, 98].map((x) => <circle key={x} cx={x} cy="76" r="2.4" fill="var(--danger)" />)}
  </>,
  /* 提示: an open guide book with a route and a pin */
  guides: <>
    <rect width="160" height="100" fill="var(--brass-100)" />
    <path d="M0 84h160v16H0Z" fill="var(--brass-200)" />
    <path d="M24 34l54 8v46L24 80Z" fill="var(--stone-50)" stroke="var(--stone-300)" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M82 42l54-8v46l-54 8Z" fill="var(--stone-100)" stroke="var(--stone-300)" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M78 42v46M82 42v46" stroke="var(--stone-300)" strokeWidth="1.5" />
    <path d="M34 48l34 5M34 56l34 5M34 64l24 3" stroke="var(--stone-300)" strokeWidth="2" strokeLinecap="round" />
    <path d="M94 70q12-4 18-12t8-10" stroke="var(--olive-600)" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" fill="none" />
    <path d="M122 30a9 9 0 0 1 9 9c0 7-9 16-9 16s-9-9-9-16a9 9 0 0 1 9-9Z" fill="var(--danger)" /><circle cx="122" cy="39" r="3.5" fill="var(--stone-50)" />
    <circle cx="94" cy="70" r="3.5" fill="var(--olive-700)" />
  </>,
};
