import { useEffect, useState } from "react";
import "./QuotaCard.css";
export interface Limit { id: string; label: string; used: number; limit: number; status: string; resetsAt: number | null; raiseUrl: string | null }
export interface Limits { disabled: boolean; quotas: Limit[]; retries: { itemId: string; failures: number; retryAt: number; reason: string }[] }
const resetTime = (at: number) => new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
export function QuotaNotice({ data, error, onBudget }: { data: Limits | null; error?: string; onBudget: () => void }) {
  const warnings = data?.quotas.filter(q => q.status !== "ok" && q.id !== "jobs") ?? [];
  if (!error && !data?.disabled && !warnings.length && !data?.retries.length) return null;
  return <aside className="iron-plate iron-rivets quota-card" aria-label="Factory limits" role="status">
    <h2 className="iron-title">Factory limits</h2>
    {error && <p>{error} Status will refresh automatically.</p>}
    {data?.disabled && <p>Planner paused by the owner. Ask the owner to restore planner power.</p>}
    {warnings.map(q => <section key={q.id} data-state={q.status}>
      <strong>{q.label}: {q.status === "stopped" ? "limit reached" : "near limit"}</strong>
      <p>{q.used.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {q.limit.toLocaleString()} {q.id === "spark-spend" ? "USD" : "used"}.</p>
      <p>{q.resetsAt ? <>Resets <time dateTime={new Date(q.resetsAt).toISOString()}>{resetTime(q.resetsAt)}</time> (00:00 UTC). Resumes automatically when capacity returns.</> : "No timed reset. Remove a connection or raise the limit."}</p>
      {q.raiseUrl === "#planner-budget" ? <button className="iron-btn" onClick={onBudget}>Raise budget</button> : q.raiseUrl ? <a className="iron-btn" href={q.raiseUrl} target="_blank" rel="noopener noreferrer">Raise limit</a> : <small>Ask the owner to raise this limit.</small>}
    </section>)}
    {data?.retries.map(r => <section key={r.itemId}>
      <strong>Issue #{r.itemId.replace(/^gh-/, "")}: planning paused</strong>
      <p>{r.failures}/3 failed tries today. No build run charged. {r.reason}</p>
      <p>Try again after <time dateTime={new Date(r.retryAt).toISOString()}>{resetTime(r.retryAt)}</time>. A fresh plan still needs your approval.</p>
    </section>)}
    {!!data?.quotas.length && <details><summary>All limits</summary>{data.quotas.map(q => <p key={q.id}>{q.label}: {q.used.toLocaleString()} / {q.limit.toLocaleString()}{q.id === "jobs" ? " · frees when a job finishes" : ""}</p>)}</details>}
  </aside>;
}
export function QuotaCard({ repo, onBudget }: { repo?: string; onBudget: () => void }) {
  const [data, setData] = useState<Limits | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null); setError("");
    if (!repo) return;
    let active = true, fetching = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch(`/api/repos/${repo.split("/").map(encodeURIComponent).join("/")}/limits`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Factory limits unavailable.");
        const value = await response.json() as Limits;
        if (active) { setData(value); setError(""); }
      } catch { if (active) setError("Factory limits unavailable."); }
      finally { fetching = false; }
    };
    const changed = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = window.setInterval(changed, 15000);
    window.addEventListener("focus", changed);
    window.addEventListener("shiptorio:budget-updated", changed);
    document.addEventListener("visibilitychange", changed);
    return () => { active = false; controller.abort(); clearInterval(timer); window.removeEventListener("focus", changed); window.removeEventListener("shiptorio:budget-updated", changed); document.removeEventListener("visibilitychange", changed); };
  }, [repo]);
  return repo ? <QuotaNotice data={data} error={error} onBudget={onBudget} /> : null;
}
