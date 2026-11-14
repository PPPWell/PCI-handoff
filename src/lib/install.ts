import { track } from "./analytics";

/** "Add to home screen" state shared by the claim page and the home page. `beforeinstallprompt` fires once, early, so it is
 * captured here for the whole session and handed to whichever component asks later. */
export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export type InstallPlatform = "installed" | "ios" | "android" | "other";

const DISMISS_KEY = "pci:install:dismissed:v1", DISMISS_DAYS = 30;
let deferred: InstallEvent | null = null, started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Called once from the site layout. */
export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; emit(); track("app_installed"); });
  if (detectPlatform() === "installed") track("app_opened_standalone");
}
export function subscribeInstall(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const canPromptInstall = (): boolean => deferred !== null;

export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null; emit();
  try {
    await event.prompt();
    const accepted = (await event.userChoice).outcome === "accepted";
    track(accepted ? "install_prompt_accepted" : "install_prompt_dismissed");
    return accepted;
  } catch { return false; }
}
export function detectPlatform(): InstallPlatform {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true) return "installed";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return /Android/.test(ua) ? "android" : "other";
}
/** The "later" choice lasts 30 days; blocked storage just means the card shows again. */
export function installDismissed(): boolean {
  try { const at = Number(window.localStorage.getItem(DISMISS_KEY)); return at > 0 && Date.now() - at < DISMISS_DAYS * 864e5; } catch { return false; }
}
export function dismissInstall(): void { try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage blocked: shows again next visit */ } }
