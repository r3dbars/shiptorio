import assert from "node:assert/strict";

/** A signed service hop proves key compatibility without reading either secret or resetting a factory. */
export async function probeStagingFixture(password: string, send: typeof fetch = fetch) {
  assert(password, "Staging preview password unavailable");
  const origin = "https://shiptorio.dev";
  const call = async (path: string, init?: RequestInit) => {
    try { return await send(origin + path, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error("Staging fixture probe request failed; credentials were not logged"); }
  };
  const blocked = await call("/api/me");
  assert(blocked.status === 401, "Staging preview gate must reject anonymous API access");
  const access = await call("/access", { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password, next: "/test/login?as=test-newbie" }) });
  assert(access.status === 303, "Staging preview sign-in failed");
  const preview = access.headers.getSetCookie().find(c => c.startsWith("shiptorio_access="))?.split(";")[0];
  assert(preview, "Staging preview cookie missing");
  const login = await call("/test/login?as=test-newbie", { headers: { cookie: preview } });
  assert(login.status === 303, "Staging tester sign-in failed");
  const session = login.headers.getSetCookie().find(c => c.startsWith("shiptorio_session="))?.split(";")[0];
  assert(session, "Staging tester session missing");
  const cookie = `${preview}; ${session}`;
  const me = await call("/api/me", { headers: { cookie } });
  assert(me.ok, "Staging tester identity unavailable");
  let identity: { login?: string; admin?: boolean; guest?: boolean };
  try { identity = await me.json(); } catch { throw new Error("Staging tester identity was not valid JSON"); }
  assert(identity.login === "test-newbie" && identity.admin === false && identity.guest === false, "Unexpected staging tester identity");
  const fixture = await call("/test/install", { headers: { cookie } });
  assert(fixture.ok, "Signed private fixture request failed; verify existing TEST_FACTORY_KEY compatibility");
  let form: string;
  try { form = await fixture.text(); } catch { throw new Error("Private fixture install form unavailable"); }
  assert(form.includes("/test/install?confirm=1"), "Private fixture did not return its isolated install form");
}

if (import.meta.main) {
  await probeStagingFixture(process.env.SHIPTORIO_TEST_PASSWORD ?? "");
  console.log("Staging fixture probe passed: preview gate, tester session and signed private service hop. No install, reset, runner or launch performed.");
}
