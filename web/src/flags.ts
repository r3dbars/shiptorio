// HTTP feature configuration stays outside the factory websocket contract.
export let introEnabled = true;
/** docs/ATTENTION.md: the calm Needs you tray. Server flag "attention", or ?attention=1 / ?attention=0 to try it. */
export let attentionEnabled = true;
const attentionParam = () => new URLSearchParams(location.search).get("attention");
export const attentionOn = () => { const p = attentionParam(); return p === null ? attentionEnabled : p !== "0"; };
export async function loadFeatureFlags(): Promise<void> {
  // Explicit simulator URLs work offline and never depend on the backend.
  if (new URLSearchParams(location.search).get("source") === "sim") return;
  try {
    const response = await fetch("/api/flags", { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return;
    const flags = await response.json();
    if (typeof flags.intro === "boolean") introEnabled = flags.intro;
    if (typeof flags.attention === "boolean") attentionEnabled = flags.attention;
  } catch { /* Keep the simulator's existing welcome behavior when offline. */ }
}
