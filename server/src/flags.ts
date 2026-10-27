/** Global false is a kill switch; user overrides may opt out or opt into a default-off feature. */
export const FLAG_DEFAULTS = { intro: true, research: true, permits: true, autonomy: false, newFeatures: false, attention: true };
export type Flag = keyof typeof FLAG_DEFAULTS;
export type Flags = Record<Flag, boolean>;
export interface FlagsEnv { CACHE?: KVNamespace }
export const flagName = (name: string): name is Flag => Object.hasOwn(FLAG_DEFAULTS, name);
export const flagKey = (name: Flag, user?: string) => `flags:v1:${user ? `user:${user.toLowerCase()}` : "global"}:${name}`;
export async function flagEnabled(env: FlagsEnv, name: Flag, user?: string): Promise<boolean> {
  if (!env.CACHE) return FLAG_DEFAULTS[name]; // simulator/test environments
  try {
    const global = await env.CACHE.get(flagKey(name));
    if (global === "false") return false;
    const personal = user ? await env.CACHE.get(flagKey(name, user)) : null;
    return personal === "true" ? true : personal === "false" ? false : global === "true" ? true : FLAG_DEFAULTS[name];
  } catch { return false; } // a failed flag read never enables autonomous action
}
export async function readFlags(env: FlagsEnv, user?: string): Promise<Flags> {
  const names = Object.keys(FLAG_DEFAULTS) as Flag[];
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await flagEnabled(env, name, user)]))) as Flags;
}
