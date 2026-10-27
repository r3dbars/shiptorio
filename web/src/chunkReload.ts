// Kept in the tiny entry module: recovery must be listening before any game/vendor import.
const RELOAD_KEY = "shiptorio:chunk-reloaded";
const IMPORT_FAILURE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|Unable to preload CSS/i;

export function installChunkReload() {
  let reloading = false;
  const recover = () => {
    if (reloading) return true;
    try {
      // Do not clear on boot/success: another missing chunk after reload must never loop.
      if (sessionStorage.getItem(RELOAD_KEY)) return false;
      sessionStorage.setItem(RELOAD_KEY, "1");
    } catch {
      // Without persistent storage we cannot prove that a reload would be safe.
      return false;
    }
    reloading = true;
    location.reload();
    return true;
  };
  const notice = () => {
    if (document.getElementById("chunk-reload-notice")) return;
    const alert = document.createElement("div");
    alert.id = "chunk-reload-notice";
    alert.setAttribute("role", "alert");
    alert.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;gap:16px;padding:24px;background:#0b0806;color:#f4ead8;font:18px system-ui";
    alert.textContent = "The factory updated while you were playing. Please refresh to continue.";
    const refresh = document.createElement("button");
    refresh.textContent = "Refresh factory";
    refresh.onclick = () => location.reload();
    alert.append(refresh);
    document.body.append(alert);
  };
  window.addEventListener("vite:preloadError", (event) => {
    // Vite catches errors even when React.lazy or a map fallback handles the rejection.
    event.preventDefault();
    if (!recover()) notice();
  });
  const failed = (reason: unknown) => IMPORT_FAILURE.test(reason instanceof Error ? reason.message : String(reason));
  window.addEventListener("unhandledrejection", (event) => {
    if (!failed(event.reason)) return;
    event.preventDefault();
    if (!recover()) notice();
  });
  window.addEventListener("error", (event) => {
    if (!failed(event.error ?? event.message)) return;
    event.preventDefault();
    if (!recover()) notice();
  });
}
