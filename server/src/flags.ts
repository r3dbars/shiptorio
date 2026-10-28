/** Global false is a kill switch; user overrides may opt out or opt into a default-off feature. */
export const FLAG_DEFAULTS = { intro: true, research: true, permits: true, autonomy: false, newFeatures: false, attention: true, brain: false, learn: true };
export type Flag = keyof typeof FLAG_DEFAULTS;
export type Flags = Record<Flag, boolean>;
/** FEATURES="all" (the staging worker, shiptorio.dev) defaults every flag on: new features ship ON on dev
 * (docs/context/branches.md). KV overrides still win, so a global "false" is still a kill switch there. */
export interface FlagsEnv { CACHE?: KVNamespace; FEATURES?: string }
const fallback = (env: FlagsEnv, name: Flag) => env.FEATURES === "all" || FLAG_DEFAULTS[name];
export const flagName = (name: string): name is Flag => Object.hasOwn(FLAG_DEFAULTS, name);
export const flagKey = (name: Flag, user?: string) => `flags:v1:${user ? `user:${user.toLowerCase()}` : "global"}:${name}`;
export async function flagEnabled(env: FlagsEnv, name: Flag, user?: string): Promise<boolean> {
  if (!env.CACHE) return fallback(env, name); // simulator/test environments
  try {
    const global = await env.CACHE.get(flagKey(name));
    if (global === "false") return false;
    const personal = user ? await env.CACHE.get(flagKey(name, user)) : null;
    return personal === "true" ? true : personal === "false" ? false : global === "true" ? true : fallback(env, name);
  } catch { return false; } // a failed flag read never enables autonomous action
}
export async function readFlags(env: FlagsEnv, user?: string): Promise<Flags> {
  const names = Object.keys(FLAG_DEFAULTS) as Flag[];
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await flagEnabled(env, name, user)]))) as Flags;
}

/** An explicit "false", globally or for this user: a kill switch or a personal opt-out, never just a default. */
export async function flagOptedOut(env: FlagsEnv, name: Flag, user?: string): Promise<boolean> {
  if (!env.CACHE) return false;
  try {
    if (await env.CACHE.get(flagKey(name)) === "false") return true;
    return !!user && await env.CACHE.get(flagKey(name, user)) === "false";
  } catch { return true; } // a failed flag read never enables autonomous action
}
