import "./RunnerConnection.css";
import { useEffect, useState } from "react";
interface RunnerStatus { paired: boolean; online: boolean; seenAt: number | null; harnesses: string[]; lastJob: { id: string; status: string } | null }
export function RunnerConnection({ repo }: { repo: string }) {
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/repos/${repo}/runner/status`, { cache: "no-store" });
        if (!response.ok) throw new Error("Sign in with write access to this repo to see your machine.");
        const data = await response.json() as RunnerStatus;
        if (active) { setStatus(data); setError(""); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Couldn't reach your machine status."); }
    };
    setStatus(null); void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [repo]);
  const disconnect = async () => {
    try {
      const response = await fetch(`/api/repos/${repo}/runner/disconnect`, { method: "POST" });
      if (!response.ok) throw new Error("Couldn't disconnect. Refresh and try again.");
      setStatus({ paired: false, online: false, seenAt: null, harnesses: [], lastJob: status?.lastJob ?? null }); setConfirm(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't disconnect."); }
  };
  return <section className="runner-connect" aria-label="Connect your machine">
    <h3>Connect your machine</h3>
    <p role="status" aria-live="polite">{error || (status ? status.online ? `Online · ${status.harnesses.map(h => h === "codex" ? "Codex" : "Claude Code").join(" + ") || "no agents detected"}` : status.paired ? "Offline · start your runner to connect" : "Your Claude or Codex sign-in powers this factory." : "Checking your machine…")}</p>
    {status?.seenAt && <p className="empty">Last seen {new Date(status.seenAt).toLocaleString()}</p>}
    {status?.lastJob && <p className="empty">Last job: {status.lastJob.status} · {status.lastJob.id.slice(0, 8)}</p>}
    {!status?.online && <><p>Run this on your computer, then compare the pairing code in your browser:</p><code className="runner-install">curl -fsSL https://shiptorio.com/install.sh | sh</code><p className="empty">macOS · Linux · Windows via WSL2. Keep the terminal open. Spark asks before any build starts.</p></>}
    <details><summary>Add a repo, troubleshoot or uninstall</summary><p>Already installed? Run <code>~/.local/bin/shiptorio-runner pair</code> to add this repo. One runner serves all paired repos.</p><p>Offline? Run <code>~/.local/bin/shiptorio-runner watch</code>. Check sign-ins with <code>~/.local/bin/shiptorio-runner doctor</code>.</p><p>Stop with Ctrl-C. Remove the runner and local credentials with <code>~/.local/bin/shiptorio-runner uninstall</code>.</p><a href="/docs/runner" target="_blank" rel="noreferrer">Runner setup and troubleshooting</a></details>
    {status?.paired && <button type="button" className="credit-btn" onClick={() => confirm ? void disconnect() : setConfirm(true)}>{confirm ? "Confirm disconnect from this repo" : "Disconnect this machine"}</button>}
  </section>;
}
