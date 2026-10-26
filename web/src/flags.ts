// HTTP feature configuration stays outside the factory websocket contract.
export let introEnabled = true;
export async function loadFeatureFlags(): Promise<void> {
  // Explicit simulator URLs work offline and never depend on the backend.
  if (new URLSearchParams(location.search).get("source") === "sim") return;
  try {
    const response = await fetch("/api/flags", { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return;
    const flags = await response.json();
    if (typeof flags.intro === "boolean") introEnabled = flags.intro;
  } catch { /* Keep the simulator's existing welcome behavior when offline. */ }
}
