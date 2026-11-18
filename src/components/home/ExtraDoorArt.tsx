/** Additional illustrations, matching the palette and dimensions of the original five. */
export function ExtraDoorArt({ id }: { id: "tech" | "presale" }) {
  return (
    <svg className="door__art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">
      {id === "tech" ? <>
        <rect width="160" height="100" fill="var(--olive-100)" />
        <circle cx="131" cy="27" r="18" fill="var(--brass-200)" />
        <rect x="30" y="16" width="100" height="65" rx="7" fill="var(--olive-800)" />
        <rect x="36" y="22" width="88" height="52" rx="3" fill="var(--olive-300)" />
        <path d="M45 63q20-26 35-15t35-18" stroke="var(--olive-600)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="80" cy="46" r="15" fill="var(--brass-300)" />
        <path d="M74 46h12M80 40v12" stroke="var(--olive-800)" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="70" y="81" width="20" height="6" fill="var(--olive-700)" />
        <rect x="55" y="87" width="50" height="5" rx="2" fill="var(--olive-600)" />
      </> : <>
        <rect width="160" height="100" fill="var(--brass-100)" />
        <path d="M0 82h160v18H0Z" fill="var(--brass-200)" />
        <rect x="40" y="41" width="80" height="43" rx="4" fill="var(--olive-700)" />
        <rect x="35" y="34" width="90" height="13" rx="3" fill="var(--olive-600)" />
        <path d="M74 34h12v50H74Z" fill="var(--brass-300)" />
        <path d="M35 39h90" stroke="var(--olive-800)" strokeWidth="1" />
        <path d="M80 35C40 33 50 8 67 17c10 5 13 18 13 18Z" fill="var(--danger)" />
        <path d="M80 35c40-2 30-27 13-18-10 5-13 18-13 18Z" fill="var(--danger)" />
        <circle cx="80" cy="35" r="6" fill="var(--brass-500)" />
      </>}
    </svg>
  );
}
