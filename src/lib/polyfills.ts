/**
 * Small fills for browser features the pages use but older phone browsers lack (WeChat and other in-app browsers on older
 * Android WebViews, iOS before 15.4). Without them a click can throw before anything happens. Each one is added only when
 * missing, and only the ones our own code needs: this is not a general polyfill set.
 */
export function installPolyfills(): void {
  const g = globalThis as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!Object.hasOwn) Object.defineProperty(Object, "hasOwn", { value: (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k), configurable: true, writable: true });
  if (!Array.prototype.at) Object.defineProperty(Array.prototype, "at", { value(this: unknown[], n: number) { const i = Math.trunc(n) || 0, k = i < 0 ? this.length + i : i; return this[k]; }, configurable: true, writable: true });
  if (!String.prototype.replaceAll) Object.defineProperty(String.prototype, "replaceAll", { value(this: string, from: string | RegExp, to: string) { return typeof from === "string" ? this.split(from).join(to) : this.replace(new RegExp(from.source, from.flags.includes("g") ? from.flags : from.flags + "g"), to); }, configurable: true, writable: true });
  if (g.AbortSignal && !g.AbortSignal.timeout) g.AbortSignal.timeout = (ms: number) => { const c = new AbortController(); setTimeout(() => c.abort(new DOMException("The operation timed out.", "TimeoutError")), ms); return c.signal; };
  if (g.crypto && !g.crypto.randomUUID) g.crypto.randomUUID = () => randomUuidV4();
}

/** A version 4 UUID from the best random source the browser has. */
export function randomUuidV4(): string {
  const bytes = new Uint8Array(16), c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes); else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}
