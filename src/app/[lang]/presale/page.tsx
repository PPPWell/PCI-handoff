import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { NewSectionPage } from "@/components/home/NewSectionPage";

const titles = {
  zh: "预售",
  it: "Prevendita",
  en: "Pre-sale",
} as const;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return { title: titles[lang], robots: { index: false, follow: true } };
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <NewSectionPage locale={lang} section="presale" />;
}
