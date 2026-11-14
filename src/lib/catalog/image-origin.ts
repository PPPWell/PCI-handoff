/** Keep content checks and Next image configuration on the same exact HTTPS origin. */
export function imageOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("R2_PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials");
  return url.origin;
}
