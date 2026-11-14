"use client";
import { useEffect } from "react";
import { startInstallCapture } from "@/lib/install";

/** Starts the install-prompt capture and registers the site worker that keeps the home page readable offline. */
export function ServiceWorker() {
  useEffect(() => {
    startInstallCapture();
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* no offline home; the site still works */ });
  }, []);
  return null;
}
