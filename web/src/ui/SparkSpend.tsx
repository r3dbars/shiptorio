import { useEffect, useState } from "react";

type Spend = { day: string; calls: number; inputTokens: number; outputTokens: number; estimatedUsd: number; dailyBudgetUsd: number; status: string; explanation: string; pricing: string; unmeasuredCalls: number };
const endpoint = (repo: string) => `/api/repos/${repo.split("/").map(encodeURIComponent).join("/")}/spend`;
function useSpend(repo?: string) {
  const [spend, setSpend] = useState<Spend | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setSpend(null);
    if (!repo) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(endpoint(repo));
        if (!response.ok) { if (active) setSpend(null); return; } // collaborators do not see the owner's bill
        const value = await response.json() as Spend;
        if (active) { setSpend(value); setError(""); }
      } catch { if (active) setError("Spend refresh unavailable"); }
    };
    void refresh();
    const changed = () => void refresh();
    window.addEventListener("shiptorio:budget-updated", changed);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => { active = false; clearInterval(timer); window.removeEventListener("shiptorio:budget-updated", changed); };
  }, [repo]);
  return { spend, setSpend, error, setError };
}
export function SparkSpendChip({ repo, onOpen, expanded }: { repo?: string; expanded?: boolean; onOpen: () => void }) {
  const { spend, error } = useSpend(repo);
  if (!spend) return null;
  return <>
    <button className="chip spark-spend" onClick={onOpen} title={error || spend.explanation} aria-label={`Planner spend: $${spend.estimatedUsd.toFixed(4)} of $${spend.dailyBudgetUsd.toFixed(2)} today. ${spend.status}`}>
      <span>~${spend.estimatedUsd.toFixed(2)}<small>Planner / ${spend.dailyBudgetUsd.toFixed(2)}</small></span>
    </button>
    {!expanded && spend.status !== "ok" && <aside className="card spend-warning" role="status">
      <b>{spend.status === "stopped" ? "Thinking budget reached" : "Thinking budget at 80%"}</b>
      <p>{spend.explanation}</p><button className="credit-btn" onClick={onOpen}>Review daily budget</button>
    </aside>}
  </>;
}
export function SparkSpendPanel({ repo }: { repo?: string }) {
  const { spend, setSpend, error, setError } = useSpend(repo);
  const [saving, setSaving] = useState(false);
  if (!spend || !repo) return null;
  return <section aria-label="Planner daily budget" className="spend-panel">
    <h3>Planner daily budget · {spend.day} UTC</h3>
    <p>~${spend.estimatedUsd.toFixed(4)} / ${spend.dailyBudgetUsd.toFixed(2)} · {spend.calls} calls</p>
    <p>{spend.inputTokens.toLocaleString()} tokens in · {spend.outputTokens.toLocaleString()} out{spend.unmeasuredCalls ? ` · ${spend.unmeasuredCalls} unmeasured calls` : ""}</p>
    <p className={spend.status === "ok" ? "empty" : "empty warn"}>{spend.explanation}</p>
    <form onSubmit={async event => {
      event.preventDefault();
      const dailyBudgetUsd = Number(new FormData(event.currentTarget).get("budget"));
      setSaving(true);
      try {
        const response = await fetch(endpoint(repo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dailyBudgetUsd }) });
        if (!response.ok) throw new Error("Budget could not be saved. Try again.");
        setSpend(await response.json()); setError("");
        window.dispatchEvent(new Event("shiptorio:budget-updated"));
      } catch (e) { setError(e instanceof Error ? e.message : "Budget could not be saved"); }
      finally { setSaving(false); }
    }}>
      <label>Daily budget (USD)<input key={spend.dailyBudgetUsd} name="budget" type="number" required min="0" max="10000" step="0.01" defaultValue={spend.dailyBudgetUsd} /></label>
      <button type="submit" className="credit-btn" disabled={saving}>{saving ? "Saving…" : "Save daily budget"}</button>
    </form>
    <small>{spend.pricing}</small>{error && <p role="alert">{error}</p>}
  </section>;
}
