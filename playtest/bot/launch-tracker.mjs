const states = new Set(["ore", "queued", "working", "inspecting", "rejected", "passed", "on_pad", "launched"]);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;

/** A real first-width transition is the authority for later-width persistence checks. */
export function createLaunchTracker({ origin, repo }) {
  const freshIds = new Set(), viewports = [];
  let baseline, minimumRockets;
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
        receipt = { width, repo, confirmed: true, mode, itemIds: [...freshIds], minimumRockets: minimumRockets ?? null };
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
            const rockets = count(data.metrics?.rockets);
            if (requireFresh && !freshIds.size && snapshot && !transitions.length && rockets !== undefined) baseline = Math.max(baseline ?? 0, rockets);
            for (const item of items) seen.set(item.id, item.state);
            if (requireFresh && transitions.length) {
              for (const item of transitions) freshIds.add(item.id);
              const floor = baseline === undefined ? undefined : count(baseline + freshIds.size);
              // Without a safe baseline, only the exact observed item can prove persistence.
              minimumRockets = floor === undefined ? undefined : Math.max(floor, rockets ?? 0);
              accept("fresh-transition");
            } else if (!requireFresh && freshIds.size) {
              if (items.some(item => item.state === "launched" && freshIds.has(item.id))) accept("persisted-item");
              else if (snapshot && minimumRockets !== undefined && rockets !== undefined && rockets >= minimumRockets) accept("persisted-counter");
            }
          };
        },
      };
      viewports.push(viewport);
      return viewport;
    },
  };
}
