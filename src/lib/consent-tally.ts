/** One anonymous count per banner choice and day (accept / reject). No identifier is sent or stored; the call exists so the consent rate
 * can be computed even though a refusal may not be reported to the analytics tool. */
export type ConsentChoice = "accept" | "reject";

export async function recordConsentChoice(choice: ConsentChoice, config: { url?: string; secretKey?: string }, transport: typeof fetch = fetch): Promise<boolean> {
  try {
    const origin = new URL(config.url ?? "");
    if (choice !== "accept" && choice !== "reject") return false;
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash || !/^sb_secret_[A-Za-z0-9_-]+$/.test(config.secretKey ?? "")) return false;
    const response = await transport(new URL("/rest/v1/rpc/pci_record_consent", origin), {
      method: "POST", headers: { apikey: config.secretKey!, "Content-Type": "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(1500),
      body: JSON.stringify({ p_choice: choice }),
    });
    return response.ok;
  } catch { return false; }
}

/** Browser side: fire and forget, never blocks the banner. */
export function reportConsentChoice(choice: ConsentChoice): void {
  try {
    void fetch("/api/consent/", { method: "POST", keepalive: true, credentials: "omit", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }) }).catch(() => { /* optional */ });
  } catch { /* optional */ }
}
