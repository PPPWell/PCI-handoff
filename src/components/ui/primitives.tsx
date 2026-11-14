import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...props }: ComponentPropsWithoutRef<"button"> & { variant?: "primary" | "secondary" }) {
  return <button type="button" className={`button button--${variant} ${className}`} {...props} />;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function Card({ className = "", ...props }: ComponentPropsWithoutRef<"article">) {
  return <article className={`card ${className}`} {...props} />;
}
export function Field({ label, id, className = "", ...props }: ComponentPropsWithoutRef<"input"> & { label: string; id: string }) {
  return <div className={`field ${className}`}><label htmlFor={id}>{label}</label><input id={id} {...props} /></div>;
}
export function NoImage({ label, monogram, compact = false }: { label: string; monogram: string; compact?: boolean }) {
  return <div className={`no-image ${compact ? "no-image--compact" : ""}`} role="img" aria-label={label}><span aria-hidden="true">{monogram}</span>{!compact && <span className="no-image__caption" aria-hidden="true">{label}</span>}</div>;
}
