"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";
import { showDialog, closeDialog } from "@/lib/dialog";
import { track } from "@/lib/analytics";
import { canPromptInstall, detectPlatform, dismissInstall, installDismissed, promptInstall, startInstallCapture, subscribeInstall, type InstallPlatform } from "@/lib/install";

const copy = {
  zh: {
    title: "把中意公馆放到桌面", body: "下次到店，一点图标就能找到你的券。", add: "添加到桌面", later: "以后再说", link: "添加到桌面", close: "关闭", done: "好了",
    ios: ["点 Safari 底部的“分享”按钮 {share}（方框加向上箭头）。", "选择“添加到主屏幕”。", "点右上角“添加”。"],
    other: ["打开浏览器菜单（⋮ 或 ⋯）。", "选择“添加到主屏幕”或“安装应用”。"],
  },
  it: {
    title: "Metti Palazzo Italia-Cina sulla schermata Home", body: "La prossima volta al ristorante ritrovi il coupon con un tocco.", add: "Aggiungi alla schermata Home", later: "Più tardi", link: "Aggiungi alla schermata Home", close: "Chiudi", done: "Fatto",
    ios: ["Tocca Condividi {share} in basso in Safari (il quadrato con la freccia).", "Scegli “Aggiungi alla schermata Home”.", "Tocca “Aggiungi” in alto a destra."],
    other: ["Apri il menu del browser (⋮ o ⋯).", "Scegli “Aggiungi a schermata Home” o “Installa app”."],
  },
  en: {
    title: "Put Palazzo Italia-Cina on your home screen", body: "Next time at the restaurant, find your coupon with one tap.", add: "Add to home screen", later: "Not now", link: "Add to home screen", close: "Close", done: "Done",
    ios: ["Tap Share {share} at the bottom of Safari (the square with an arrow).", "Choose “Add to Home Screen”.", "Tap “Add” at the top right."],
    other: ["Open the browser menu (⋮ or ⋯).", "Choose “Add to Home screen” or “Install app”."],
  },
} as const;

function useInstall() {
  const can = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [platform, setPlatform] = useState<InstallPlatform | null>(null), [dismissed, setDismissed] = useState(true);
  useEffect(() => { startInstallCapture(); const t = window.setTimeout(() => { setPlatform(detectPlatform()); setDismissed(installDismissed()); }, 0); return () => window.clearTimeout(t); }, []);
  return { can, platform, dismissed, dismiss: () => { dismissInstall(); setDismissed(true); } };
}

/** The iOS "Share" glyph (a box with an arrow leaving the top), so people can spot the button in Safari. */
function ShareIcon({ label }: { label: string }) {
  return <svg className="install-share" role="img" aria-label={label} viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 9H7.5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1" /><path d="M12 15V3.5" /><path d="M8.5 6.8 12 3.3l3.5 3.5" /></svg>;
}
const shareLabel = { zh: "分享按钮", it: "Pulsante Condividi", en: "Share button" } as const;

function Steps({ locale, platform, can }: { locale: Locale; platform: InstallPlatform; can: boolean }) {
  if (can) return null;
  const t = copy[locale];
  return <ol className="install-steps">{(platform === "ios" ? t.ios : t.other).map((s) => { const [before, after] = s.split("{share}"); return <li key={s}>{after === undefined ? s : <>{before}<ShareIcon label={shareLabel[locale]} />{after}</>}</li>; })}</ol>;
}

/** After a successful claim: one card, one button. Hidden when already installed or put off in the last 30 days. */
export function InstallCard({ locale }: { locale: Locale }) {
  const { can, platform, dismissed, dismiss } = useInstall(), t = copy[locale];
  const show = !!platform && platform !== "installed" && !dismissed;
  useEffect(() => { if (show) track("install_card_shown", { platform: platform!, native_prompt: can }); }, [show, platform, can]);
  if (!show) return null;
  return <section className="install-card" aria-labelledby="install-title">
    <h3 id="install-title">{t.title}</h3>
    <p>{t.body}</p>
    <Steps locale={locale} platform={platform} can={can} />
    {can && <button type="button" className="button button--primary" onClick={() => void promptInstall().then((ok) => { if (ok) dismiss(); })}>{t.add}</button>}
    <button type="button" className="button button--quiet" onClick={() => { track("install_later"); dismiss(); }}>{can ? t.later : t.done}</button>
  </section>;
}

/** Small permanent entry at the bottom of the home page; opens the same steps in a dialog. Not shown once installed. */
export function InstallLink({ locale }: { locale: Locale }) {
  const { can, platform } = useInstall(), t = copy[locale], dialog = useRef<HTMLDialogElement>(null);
  if (!platform || platform === "installed") return null;
  const open = () => { track("install_link_opened", { platform, native_prompt: can }); showDialog(dialog.current); };
  return <div className="install-link">
    <button type="button" className="text-link" onClick={open}>{t.link}</button>
    <dialog ref={dialog} className="claim-dialog" aria-labelledby="install-dialog-title" onClick={(e) => { if (e.target === dialog.current) closeDialog(dialog.current); }}>
      <div className="claim-dialog__body">
        <h2 id="install-dialog-title">{t.title}</h2>
        <p>{t.body}</p>
        <Steps locale={locale} platform={platform} can={can} />
        {can && <button type="button" className="button button--primary" onClick={() => void promptInstall().then((ok) => { if (ok) closeDialog(dialog.current); })}>{t.add}</button>}
        <button type="button" className="button button--secondary" onClick={() => closeDialog(dialog.current)}>{t.close}</button>
      </div>
    </dialog>
  </div>;
}
