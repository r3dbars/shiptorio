import { loadPairings, updatePairing, type Pairing } from "./pairing";

// Decoding only compares local copies; the server still verifies signatures,
// the live session, repository access and revocation on every authenticated call.
function grant(pair: Pairing) {
  try {
    const [body, signature, extra] = pair.token.split(".");
    if (!body || !signature || extra || pair.token.length > 2048) throw Error();
    const value = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (value.purpose !== "runner" || value.repo?.toLowerCase() !== pair.repo.toLowerCase() || typeof value.pairId !== "string" || !value.pairId || !Number.isFinite(value.expires) || value.expires !== pair.expires) throw Error();
    const user = value.user;
    if (user !== undefined && (!Number.isSafeInteger(user?.id) || typeof user.login !== "string" || typeof user.sessionHash !== "string" || !Number.isFinite(user.expiresAt))) throw Error();
    return { binding: JSON.stringify([pair.repo.toLowerCase(), value.pairId, user ? [user.id, user.login, user.sessionHash, user.expiresAt] : null]), expires: value.expires as number };
  } catch { throw new Error("Invalid stored runner grant; pair this repository again"); }
}
function latest(current: Pairing, candidate: Pairing) {
  const a = grant(current), b = grant(candidate);
  return a.binding === b.binding && b.expires > a.expires ? candidate : current;
}
export async function loadConnections(root: string, env: { SHIPTORIO_REPO?: string; SHIPTORIO_RUNNER_TOKEN?: string }) {
  const pairs = await loadPairings(root);
  for (const pair of pairs) { grant(pair); pair.repo = pair.repo.toLowerCase(); }
  const repo = env.SHIPTORIO_REPO?.toLowerCase(), token = env.SHIPTORIO_RUNNER_TOKEN;
  if (repo && token) {
    let expires: number;
    try { expires = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).expires; }
    catch { throw new Error("Invalid configured runner grant; pair this repository again"); }
    const candidate = { repo, token, expires }; grant(candidate);
    const index = pairs.findIndex(pair => pair.repo === repo);
    const expected = index >= 0 ? pairs[index] : null;
    // Re-read under the same lock used by manual pairing. Never replace a new
    // pair/session with an older environment grant, or recreate a removed record.
    const selected = await updatePairing(repo, root, current => {
      if (!current && expected) throw new Error("Pairing changed while loading; retry the current connection");
      return current ? latest(current, candidate) : candidate;
    });
    if (selected) { if (index >= 0) pairs[index] = selected; else pairs.push(selected); }
  }
  return pairs;
}
export async function persistRenewal(root: string, pair: Pairing, renewed: { token: string; expires: number }) {
  const candidate = { ...pair, ...renewed }, expected = grant(pair);
  if (grant(candidate).binding !== expected.binding) throw new Error("Renewal changed runner identity; reconnect this repository");
  const persisted = await updatePairing(pair.repo, root, current => {
    if (!current || grant(current).binding !== expected.binding) throw new Error("Pairing changed during renewal; retry the current connection");
    return latest(current, candidate);
  });
  // A failed write must not leave the running process ahead of durable storage.
  Object.assign(pair, persisted);
}
