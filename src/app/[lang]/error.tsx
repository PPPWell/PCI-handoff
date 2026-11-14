"use client";
import { useParams } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { StatePanel } from "@/components/states/StatePanel";
export default function PageError({ retry }: { error: unknown; retry: () => void }) { const { lang } = useParams();return <StatePanel locale={typeof lang === "string" && isLocale(lang) ? lang : "zh"} variant="error" retry={retry} />; }
