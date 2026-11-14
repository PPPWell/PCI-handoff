'use client';
import { useState } from 'react';

/** Copies a short text; falls back to selecting nothing silently where the clipboard is blocked. */
export function CopyButton({ text, label, done, className = 'button button--secondary', trackAs }: { text: string; label: string; done: string; className?: string; trackAs?: 'address_copied' }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  return <button type="button" className={className} data-track={trackAs} onClick={copy} aria-live="polite">{copied ? done : label}</button>;
}
