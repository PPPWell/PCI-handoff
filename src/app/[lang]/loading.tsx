"use client";
import { useParams } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { LoadingState } from "@/components/states/LoadingState";
export default function Loading() { const { lang } = useParams();return <LoadingState locale={typeof lang === "string" && isLocale(lang) ? lang : "zh"} />; }
