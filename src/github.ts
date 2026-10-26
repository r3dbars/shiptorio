// GitHub App auth + webhook verification, using only WebCrypto so it runs on Workers.

const API = "https://api.github.com";
const UA = "shiptorio";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | out.length, ...out];
}

function derWrap(tag: number, content: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([tag, ...derLength(content.length), ...content]);
}

// GitHub hands out PKCS#1 keys ("BEGIN RSA PRIVATE KEY") but WebCrypto only imports PKCS#8.
// Wrap it so nobody has to run openssl first.
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = Uint8Array.from([0x02, 0x01, 0x00]);
  const rsaAlgId = Uint8Array.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const key = derWrap(0x04, pkcs1);
  return derWrap(0x30, Uint8Array.from([...version, ...rsaAlgId, ...key]));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  let der = pemToDer(pem);
  if (pem.includes("BEGIN RSA PRIVATE KEY")) der = pkcs1ToPkcs8(der);
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

export async function appJwt(appId: string, privateKeyPem: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000) - 60; // allow for clock drift
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat, exp: iat + 9 * 60, iss: appId }));
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyWebhookSignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  const expected = "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

export interface AppCredentials {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
}

async function gh<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": UA,
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function installationToken(env: AppCredentials, installationId: number): Promise<string> {
  const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  const res = await gh<{ token: string }>(`/app/installations/${installationId}/access_tokens`, jwt, {
    method: "POST",
  });
  return res.token;
}

export async function repoInstallationId(env: AppCredentials, fullName: string): Promise<number> {
  const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  const res = await gh<{ id: number }>(`/repos/${fullName}/installation`, jwt);
  return res.id;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

export async function repoTree(
  token: string,
  fullName: string,
): Promise<{ branch: string; sha: string; entries: TreeEntry[]; truncated: boolean }> {
  const repo = await gh<{ default_branch: string }>(`/repos/${fullName}`, token);
  const tree = await gh<{ sha: string; tree: TreeEntry[]; truncated: boolean }>(
    `/repos/${fullName}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
    token,
  );
  return { branch: repo.default_branch, sha: tree.sha, entries: tree.tree, truncated: tree.truncated };
}

export async function pullRequestFiles(token: string, fullName: string, number: number): Promise<string[]> {
  const files = await gh<{ filename: string }[]>(`/repos/${fullName}/pulls/${number}/files?per_page=100`, token);
  return files.map((f) => f.filename);
}

export async function convertManifestCode(code: string): Promise<{
  id: number;
  slug: string;
  html_url: string;
  pem: string;
  webhook_secret: string;
}> {
  const res = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", "user-agent": UA },
  });
  if (!res.ok) throw new Error(`manifest conversion failed: ${res.status} ${await res.text()}`);
  return res.json();
}
