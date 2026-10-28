const states = new Set(["ore", "queued", "working", "inspecting", "rejected", "passed", "on_pad", "launched"]);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;

// Match the HUD for this bounded fixture resume (no intervening research),
// not a general cumulative ledger: metrics.rockets, otherwise its science sum.
function shipped(data) {
  if (data.metrics !== undefined) {
    const value = count(data.metrics?.rockets);
    return { source: "metrics.rockets", value, invalid: value === undefined };
  }
  if (data.science !== undefined) {
    const packs = ["red", "green", "grey", "blue"].map(key => count(data.science?.[key]));
    const value = packs.every(pack => pack !== undefined) ? count(packs.reduce((sum, pack) => sum + pack, 0)) : undefined;
    return { source: "science", value, invalid: value === undefined };
  }
  return null;
}

/** A real first-width transition is the authority for later-width persistence checks. */
export function createLaunchTracker({ origin, repo }) {
  const freshIds = new Set(), viewports = [];
  let baseline, minimumShipped, counterSource, invalidBaseline = false;
  return {
    get observedLaunch() { return freshIds.size > 0; },
    results: () => viewports.map(viewport => viewport.result()),
    viewport(width) {
      const requireFresh = viewports.length === 0;
      const seen = new Map();
      let receipt = null, resolve;
      const confirmed = new Promise(done => { resolve = done; });
      const accept = mode => {
        if (receipt) return;
        receipt = { width, repo, confirmed: true, mode, itemIds: [...freshIds], minimumShipped: minimumShipped ?? null, counter: counterSource ?? null };
        resolve();
      };
      const viewport = {
        get confirmed() { return receipt !== null; },
        promise: confirmed,
        result: () => receipt ?? { width, repo, confirmed: false },
        socket(socketUrl) {
          let valid = false, synced = false;
          try {
            const url = new URL(socketUrl);
            const socketOrigin = `${url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : "invalid:"}//${url.host}`;
            valid = socketOrigin === origin && url.pathname === `/api/repos/${repo}/factory`;
          } catch { /* Unknown sockets cannot provide launch evidence. */ }
          return event => {
            if (!valid || !event || !["snapshot", "patch"].includes(event.type)) return;
            const snapshot = event.type === "snapshot";
            if (snapshot) synced = event.state?.repo === repo;
            if (!synced) return;
            const data = snapshot ? event.state : event.patch;
            if (!data || typeof data !== "object") return;
            const items = Array.isArray(data.items) ? data.items.filter(item => typeof item?.id === "string" && states.has(item.state)) : [];
            const transitions = items.filter(item => item.state === "launched" && seen.has(item.id) && seen.get(item.id) !== "launched" && !freshIds.has(item.id));
            const counter = shipped(data);
            if (requireFresh && counter?.invalid) invalidBaseline = true;
            if (requireFresh && !freshIds.size && snapshot && !transitions.length && counter && !counter.invalid) {
              if (!baseline) baseline = counter;
              else if (baseline.source === counter.source) baseline.value = Math.max(baseline.value, counter.value);
              else invalidBaseline = true;
            }
            for (const item of items) seen.set(item.id, item.state);
            if (requireFresh && transitions.length) {
              for (const item of transitions) freshIds.add(item.id);
              minimumShipped = undefined; counterSource = undefined;
              if (!invalidBaseline && baseline && (!counter || counter.source === baseline.source)) {
                const floor = count(baseline.value + freshIds.size);
                minimumShipped = floor === undefined ? undefined : Math.max(floor, counter?.value ?? 0);
                if (minimumShipped !== undefined) counterSource = baseline.source;
              } else if (!invalidBaseline && !baseline && counter && counter.value >= freshIds.size) {
                // A count co-delivered with the actual new transition is authoritative;
                // an arbitrary later counter is never allowed to create this receipt.
                minimumShipped = counter.value; counterSource = counter.source;
              }
              accept("fresh-transition");
            } else if (!requireFresh && freshIds.size) {
              if (items.some(item => item.state === "launched" && freshIds.has(item.id))) accept("persisted-item");
              else if (snapshot && minimumShipped !== undefined && counter && !counter.invalid && counter.source === counterSource && counter.value >= minimumShipped) accept("persisted-counter");
            }
          };
        },
      };
      viewports.push(viewport);
      return viewport;
    },
  };
}
