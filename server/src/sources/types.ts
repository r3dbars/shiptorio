import type { ItemKind, OreSource, SourceStatus } from "@shiptorio/shared";

export interface Signal {
  source: OreSource;
  externalId: string;
  fingerprint: string;
  kindHint?: ItemKind;
  title: string;
  body: string;
  url?: string;
  districtHint?: string;
  usersAffected: number;
  reporter?: string;
  reporters?: string[];
  occurredAt: number;
  rawRef: string;
  severity: number;
  paying?: boolean;
  hints: string[];
  action: "upsert" | "close" | "resolved";
}

export interface Source<TEnv> {
  verify(request: Pick<Request, "text" | "headers">, env: TEnv): Promise<boolean>;
  normalize(payload: unknown): Signal[];
  status(env: TEnv): SourceStatus;
  fake(event?: string): unknown;
}

export async function verifyHmac(secret: string | undefined, body: string, signature: string | null, prefix = ""): Promise<boolean> {
  if (!secret || !signature || !signature.startsWith(prefix)) return false;
  const supplied = signature.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ Number.parseInt(supplied.slice(i * 2, i * 2 + 2), 16);
  return difference === 0;
}
