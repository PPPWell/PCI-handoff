"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { couponCopy } from "@/lib/coupons/copy";
import { track } from "@/lib/analytics";
import { couponReturnPath } from "@/lib/coupons/return-path";
import { accountCopy } from "@/lib/auth/copy";
import { mailProvider, signinCopy } from "@/lib/auth/signin-copy";
import { setSubscribeIntent } from "@/lib/coupons/subscribe-intent";

type Destination = "account" | "merchant" | "coupon" | "subscription";
const STORAGE_KEY = "pci:signin:v1";
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const DEFAULT_COOLDOWN_S = 60;

const merchantCopy = {
  login: "Accedi all’area ristorante",
  intro: "Vi inviamo un codice di 6 cifre via email. Niente password.",
  email: "Email",
  signedIn: "Verifica completata. Apertura dell’area ristorante…",
  privacy: "Usata per verificare l’accesso. Nessuna iscrizione automatica alle email promozionali.",
  send: "Inviate il codice",
  resend: "Inviate di nuovo",
  verify: "Verificate e accedete",
  sent: "Richiesta accettata. Controllate email e spam. Il codice è valido per dieci minuti.",
  retry: "Potete riprovare dalle",
  errors: {
    invalid_request: "Controllate email e codice di sei cifre.",
    unavailable: "Servizio non disponibile. Esito non confermato: riprovate più tardi.",
    send_cooldown: "Troppi invii. Attendete prima di riprovare.",
    verification_locked: "Tentativi esauriti. Verifica bloccata per quindici minuti.",
    verification_busy: "Un’altra verifica è in corso. Riprovate tra poco.",
    invalid_challenge: "Richiesta non più valida. Inviate un nuovo codice.",
    challenge_used: "Codice già usato. Accedete o richiedete un nuovo codice.",
    code_expired: "Codice scaduto. Richiedetene uno nuovo.",
    not_sent: "Richiesta non disponibile. Inviate un nuovo codice.",
    incorrect_code: "Codice non corretto.",
  },
};

function readStored(): { email: string; sentAt: number } | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { email?: unknown; sentAt?: unknown };
    if (typeof value.email !== "string" || typeof value.sentAt !== "number") return null;
    if (Date.now() - value.sentAt > CODE_LIFETIME_MS) return null;
    return { email: value.email, sentAt: value.sentAt };
  } catch {
    return null;
  }
}
function writeStored(value: { email: string; sentAt: number } | null) {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage can be blocked (private mode, in-app browsers); the flow works without it. */
  }
}

export function EmailSignIn({ locale, enabled, destination = "account", returnTo, headingLevel = 2, subscribe = "none", bare = false }: { locale: Locale; enabled: boolean; destination?: Destination; returnTo?: string; headingLevel?: 2 | 3; subscribe?: "none" | "optional" | "implicit"; bare?: boolean }) {
  const base = accountCopy[locale];
  const c =
    destination === "merchant"
      ? { ...base, ...merchantCopy }
      : destination === "coupon" || destination === "subscription"
        ? { ...base, login: destination === "coupon" ? couponCopy[locale].signIn : couponCopy[locale].subscriptionLogin, intro: destination === "coupon" ? couponCopy[locale].signInIntro : couponCopy[locale].subscriptionLoginIntro, email: couponCopy[locale].email, privacy: couponCopy[locale].emailPrivacy }
        : base;
  const s = signinCopy[locale];
  const verifyLabel = destination === "coupon" ? s.verifyClaim : c.verify;

  const [email, setEmail] = useState("");
  const [wantsMail, setWantsMail] = useState(false);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [retry, setRetry] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [inWeChat, setInWeChat] = useState(false);
  const busy = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const autoSubmitted = useRef("");

  // Resume after a page reload (common when switching to a mail app inside an in-app browser).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInWeChat(/MicroMessenger/i.test(navigator.userAgent));
      const stored = readStored();
      if (stored && enabled) {
        setEmail(stored.email);
        setSent(true);
        // Keep the resend countdown across the reload instead of offering an immediate resend.
        setCooldown(Math.max(0, DEFAULT_COOLDOWN_S - Math.floor((Date.now() - stored.sentAt) / 1000)));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (sent && !pending && !error && !signedIn) codeInput.current?.focus();
  }, [sent, pending, error, signedIn]);

  async function post(action: "start" | "verify", body: Record<string, string>) {
    const response = await fetch(`/api/auth/email/${action}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    const result: unknown = await response.json();
    if (!result || typeof result !== "object") throw Error();
    return { ok: response.ok, value: result as Record<string, unknown> };
  }
  function fail(value: Record<string, unknown>) {
    setError(typeof value.code === "string" && Object.hasOwn(c.errors, value.code) ? value.code : "unavailable");
    if (Number.isInteger(value.attemptsRemaining) && Number(value.attemptsRemaining) >= 0 && Number(value.attemptsRemaining) <= 4) setRemaining(Number(value.attemptsRemaining));
    if (typeof value.retryAt === "string" && Number.isFinite(Date.parse(value.retryAt))) {
      setRetry(value.retryAt);
      if (value.code === "send_cooldown") setCooldown(Math.max(1, Math.ceil((Date.parse(value.retryAt) - Date.now()) / 1000)));
    }
    message.current?.focus();
  }

  async function send(event?: FormEvent) {
    if (subscribe !== "none") setSubscribeIntent(subscribe === "implicit" || wantsMail);
    event?.preventDefault();
    if (busy.current || !enabled) return;
    busy.current = true;
    setPending(true);
    setError("");
    setRetry("");
    setRemaining(null);
    if (!sent) track("signin_started");
    try {
      const { ok, value } = await post("start", { email: email.trim(), locale });
      if (ok && value.ok === true && value.code === "code_sent") {
        track("signin_code_sent");
        setSent(true);
        setCode("");
        autoSubmitted.current = "";
        const wait = typeof value.retryAt === "string" && Number.isFinite(Date.parse(value.retryAt)) ? Math.ceil((Date.parse(value.retryAt) - Date.now()) / 1000) : DEFAULT_COOLDOWN_S;
        setCooldown(Math.min(Math.max(wait, 5), 300));
        writeStored({ email: email.trim(), sentAt: Date.now() });
      } else fail(value);
    } catch {
      setError("unavailable");
      message.current?.focus();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function verify(event?: FormEvent, submitted = code) {
    event?.preventDefault();
    if (busy.current || !enabled || !/^\d{6}$/.test(submitted)) return;
    busy.current = true;
    setPending(true);
    setError("");
    setRetry("");
    setRemaining(null);
    try {
      const { ok, value } = await post("verify", { code: submitted, locale });
      if (ok && value.ok === true && value.code === "signed_in") {
        setSignedIn(true);
        writeStored(null);
        // Identity changes need a full navigation so personalised client/RSC state is discarded.
        window.location.assign(destination === "merchant" ? "/it/merchant/scan/" : couponReturnPath(returnTo, locale));
      } else {
        fail(value);
        setCode("");
      }
    } catch {
      setError("unavailable");
      message.current?.focus();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  // Verify as soon as the sixth digit arrives (typing, paste or iOS/Android one-time-code autofill).
  useEffect(() => {
    if (code.length === 6 && sent && !pending && !signedIn && autoSubmitted.current !== code) {
      autoSubmitted.current = code;
      void verify(undefined, code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function changeEmail() {
    setSent(false);
    setCode("");
    setError("");
    setRetry("");
    setRemaining(null);
    setCooldown(0);
    writeStored(null);
    window.setTimeout(() => emailInput.current?.focus(), 0);
  }

  const provider = mailProvider(email);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const titled = subscribe !== "implicit" && !bare;
  // The wait is minutes at most: the time of day is enough, said the way each language says it.
  const timeText = (value: string) => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "it" ? "it-IT" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const feedback = (
    <div id="auth-message" ref={message} tabIndex={-1} className="signin-message" aria-live="polite">
      {signedIn ? <p role="status">{c.signedIn}</p> : pending && sent ? <p role="status">{c.working}</p> : error ? (
        <p role="alert">
          {c.errors[error as keyof typeof c.errors]}
          {remaining !== null && <> {c.remaining}: {remaining}.</>}
          {retry && (locale === "zh" ? <>请在 {timeText(retry)} 后重试。</> : <> {c.retry} {timeText(retry)}.</>)}
        </p>
      ) : null}
    </div>
  );

  // One card, two steps: email, then the six digits (verified as soon as the sixth arrives). Secondary actions are text links.
  return (
    <section className="content-section signin" aria-labelledby={titled ? "email-sign-in" : undefined} aria-label={titled ? undefined : c.login}>
      {titled && <><Heading id="email-sign-in">{sent && enabled ? s.codeTitle : c.login}</Heading>
      {!(sent && enabled) && <p className="signin-lead">{c.intro}</p>}</>}
      {!enabled && <p id="email-disabled" className="preview-notice">{c.closed}</p>}
      {!sent || !enabled ? (
        <form className="account-fields signin-step" onSubmit={send} aria-describedby={!enabled ? "email-disabled" : subscribe === "implicit" ? "email-privacy" : undefined}>
          <label className="field" htmlFor="sign-in-email">
            {c.email}
            <input ref={emailInput} id="sign-in-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required placeholder={s.emailPlaceholder} disabled={!enabled || pending || signedIn} value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
          </label>
          <button className="button button--primary signin-submit" type="submit" disabled={!enabled || pending || signedIn}>{pending ? c.working : subscribe === "implicit" ? ({ zh: "订阅", it: "Iscriviti", en: "Subscribe" })[locale] : c.send}</button>
          {subscribe === "optional" && <label className="checkbox-row"><input type="checkbox" checked={wantsMail} disabled={!enabled || pending || signedIn} onChange={(e) => setWantsMail(e.target.checked)} />{s.subscribeOption}</label>}
          {feedback}
          {subscribe === "implicit" && <p id="email-privacy" className="small-copy">{c.intro}</p>}
        </form>
      ) : (
        <div className="signin-step signin-code-step">
          <p role="status" className="signin-sent">{s.sentTo} <strong lang="en">{email}</strong> <button type="button" className="signin-link" disabled={pending || signedIn} onClick={changeEmail}>{s.changeEmail}</button></p>
          <form className="account-fields" onSubmit={(e) => verify(e)}>
            <label className="field" htmlFor="sign-in-code">
              <span className="sr-only">{c.code}</span>
              {/* The resend control sits inside the field on the right, where people look for it, with its countdown. */}
              <span className="signin-code-field">
              <input ref={codeInput} id="sign-in-code" className="signin-code-input" aria-invalid={error === "incorrect_code" || error === "code_expired"} aria-describedby="auth-message" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="000000" disabled={pending || signedIn} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              <button type="button" className="signin-resend-inline" disabled={cooldown > 0 || pending || signedIn} onClick={() => void send()}>{cooldown > 0 ? s.resendIn(cooldown) : s.resendNow}</button>
              </span>
            </label>
            <button className="sr-only" type="submit" tabIndex={-1} disabled={pending || code.length !== 6 || signedIn}>{verifyLabel}</button>
          </form>
          {feedback}
          <p className="small-copy signin-resend">{s.spamHint}</p>
          {provider && s.providers[provider] && <p className="small-copy">{s.providers[provider]}</p>}
          {inWeChat && <p className="small-copy">{s.wechat}</p>}
        </div>
      )}
      {destination !== "merchant" && subscribe !== "implicit" && !(sent && enabled) && (
        <p className="small-copy signin-legal">
          {s.agree[0]}<Link className="text-link" href={`/${locale}/legal/terms/`}>{s.terms}</Link>{s.agree[1]}<Link className="text-link" href={`/${locale}/legal/privacy/`}>{s.privacy}</Link>{s.agree[2]}
        </p>
      )}
    </section>
  );
}
