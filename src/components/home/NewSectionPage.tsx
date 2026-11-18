import Link from "next/link";
import type { Locale } from "@/lib/i18n";

type Section = "tech" | "presale";

const copy = {
  zh: {
    tech: { title: "科技产品", description: "科技产品专区即将上线，敬请期待。" },
    presale: { title: "预售", description: "预售专区即将开放，敬请期待。" },
    back: "返回首页",
  },
  it: {
    tech: { title: "Tecnologia", description: "La sezione tecnologia sarà presto disponibile." },
    presale: { title: "Prevendita", description: "La sezione prevendita sarà presto disponibile." },
    back: "Torna alla home",
  },
  en: {
    tech: { title: "Technology", description: "Our technology section is coming soon." },
    presale: { title: "Pre-sale", description: "Our pre-sale section is coming soon." },
    back: "Back to home",
  },
} as const;

export function NewSectionPage({ locale, section }: { locale: Locale; section: Section }) {
  const page = copy[locale][section];
  return (
    <main id="main-content" tabIndex={-1} className="container" style={{ paddingBlock: "clamp(3rem, 8vw, 7rem)", minHeight: "50vh" }}>
      <h1 className="type-display">{page.title}</h1>
      <p style={{ marginBlock: "1.5rem", color: "var(--ink-2)" }}>{page.description}</p>
      <Link className="text-link" href={`/${locale}/`}>{copy[locale].back}</Link>
    </main>
  );
}
