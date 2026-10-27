import "./RunnerConnection.css";
import { useEffect, useRef, useState } from "react";
import { RUNNER } from "../copy";
import { PowerPlug, type PlugState } from "./ironArt";

const INSTALL = "curl -fsSL https://shiptorio.com/install.sh | sh";
interface Join { join: string; expires: number }
interface RunnerStatus { paired: boolean; online: boolean; seenAt: number | null; harnesses: string[]; lastJob: { id: string; status: string } | null }

/** Your machine as a power cable into the factory's wall socket: seated and pulsing when the runner is online. */
export function RunnerConnection({ repo }: { repo: string }) {
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [join, setJoin] = useState<Join | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/repos/${repo}/runner/status`, { cache: "no-store" });
        if (!response.ok) throw new Error(RUNNER.noAccess);
        const data = await response.json() as RunnerStatus;
        if (active) { setStatus(data); setError(""); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : RUNNER.unreachable); }
    };
    setStatus(null); void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [repo]);
  // Not plugged in yet: mint a one-paste setup command, and a fresh one once the last expires (ten minutes, one use).
  const unpaired = status?.paired === false;
  const minting = useRef(false);
  useEffect(() => {
    if (!unpaired) { setJoin(null); return; }
    if (minting.current || (join && join.expires > Date.now() + 30_000)) return;
    minting.current = true;
    void fetch(`/api/repos/${repo}/runner/join`, { method: "POST" })
      .then((r) => (r.ok ? r.json() as Promise<Join> : null)).then((j) => { if (j) setJoin(j); }).catch(() => {})
      .finally(() => { minting.current = false; });
  }, [repo, unpaired, status, join]);
  const command = join ? `${INSTALL} -s -- --join ${join.join}` : INSTALL;
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the command stays selectable */ }
  };
  // Online but no agent signed in yet: jobs would fail, so it isn't "ready" until Claude Code or Codex is.
  const needsSignIn = !!status?.online && status.harnesses.length === 0;
  const disconnect = async () => {
    try {
      const response = await fetch(`/api/repos/${repo}/runner/disconnect`, { method: "POST" });
      if (!response.ok) throw new Error(RUNNER.disconnectFailed);
      setStatus({ paired: false, online: false, seenAt: null, harnesses: [], lastJob: status?.lastJob ?? null }); setConfirm(false);
    } catch (e) { setError(e instanceof Error ? e.message : RUNNER.disconnectFailedShort); }
  };
  const plug: PlugState = !status ? "unknown" : status.online ? "online" : status.paired ? "offline" : "unpaired";
  const word = error ? RUNNER.state.error : RUNNER.state[plug];
  const agents = status?.harnesses.map((h) => RUNNER.agent[h] ?? h).join(" + ") || RUNNER.noAgents;
  return <section className={`runner-connect ${error ? "error" : plug}`} aria-label={RUNNER.title}>
    <div className="rc-head">
      <h3>{RUNNER.title}</h3>
      <span className="rc-state">{word}</span>
    </div>
    <PowerPlug state={error ? "unpaired" : plug} />
    <p role="status" aria-live="polite">{error || (status ? needsSignIn ? RUNNER.signIn : status.online ? RUNNER.online(agents) : status.paired ? RUNNER.offline : join ? RUNNER.waiting : RUNNER.unpaired : RUNNER.checking)}</p>
    {status?.seenAt && <p className="empty">{RUNNER.lastSeen(new Date(status.seenAt).toLocaleString())}</p>}
    {status?.lastJob && <p className="empty">{RUNNER.lastJob(RUNNER.job[status.lastJob.status] ?? RUNNER.unknownJob, status.lastJob.id.slice(0, 8))}</p>}
    {!status?.online && <>
      <p>{join ? RUNNER.pasteThis : RUNNER.runThis}</p>
      <code className="runner-install">{command}</code>
      <button type="button" className="credit-btn rc-copy" onClick={() => void copy()}>{copied ? RUNNER.copied : RUNNER.copy}</button>
      <p className="empty">{join ? RUNNER.joinNote : RUNNER.platforms}</p>
    </>}
    <details><summary>{RUNNER.more}</summary><p>{RUNNER.addRepo[0]}<code>~/.local/bin/shiptorio-runner pair</code>{RUNNER.addRepo[1]}</p><p>{RUNNER.offlineHelp[0]}<code>~/.local/bin/shiptorio-runner watch</code>{RUNNER.offlineHelp[1]}<code>~/.local/bin/shiptorio-runner doctor</code>.</p><p>{RUNNER.uninstall}<code>~/.local/bin/shiptorio-runner uninstall</code>.</p><a href="/docs/runner" target="_blank" rel="noreferrer">{RUNNER.docs}</a></details>
    {status?.paired && <button type="button" className="credit-btn" onClick={() => confirm ? void disconnect() : setConfirm(true)}>{confirm ? RUNNER.confirmDisconnect : RUNNER.disconnect}</button>}
  </section>;
}
