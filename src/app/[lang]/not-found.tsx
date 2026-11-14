"use client";
import { useParams } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { StatePanel } from "@/components/states/StatePanel";
export default function NotFound() { const { lang } = useParams();return <StatePanel locale={typeof lang === "string" && isLocale(lang) ? lang : "zh"} variant="missing" />; }
