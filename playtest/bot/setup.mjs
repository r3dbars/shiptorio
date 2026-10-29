/** Staging fixture reset is setup: no game may mount until it has completed. */
export function botAdmissionPath({ local, persona, width }) {
  return !local && persona !== "test-guest" && width === 390 ? "/test/users" : "/test/login";
}

export async function prepareBotPersona({ page, context, origin, persona, local, width, password }) {
  const admissionPath = botAdmissionPath({ local, persona, width });
  const preparingStaging = admissionPath === "/test/users";
  const loginUrl = `${origin}/test/login?as=${persona}`;
  await page.goto(preparingStaging ? `${origin}${admissionPath}` : loginUrl);
  const passwordField = page.getByLabel("Password", { exact: true });
  if (await passwordField.count()) {
    if (!password) throw new Error("Staging preview password is required in SHIPTORIO_TEST_PASSWORD");
    await passwordField.fill(password);
    await Promise.all([
      page.waitForURL(current => preparingStaging ? current.pathname === admissionPath : isFixtureDeckPage(current, origin), { timeout: 20000, waitUntil: "domcontentloaded" }),
      page.getByRole("button", { name: /Enter the factory/ }).click(),
    ]);
    // The inert gate redirects back to the same URL; URL equality alone does not
    // prove the password form was submitted successfully.
    await passwordField.waitFor({ state: "hidden", timeout: 20000 });
  }
  const login = preparingStaging
    ? await context.request.get(loginUrl, { maxRedirects: 0 })
    : await page.goto(loginUrl);
  if (login && login.status() >= 400) throw new Error(`Test login unavailable: HTTP ${login.status()}`);
  if (!preparingStaging) return;
  let reset;
  for (let attempt = 0; attempt < 15; attempt++) {
    const response = await context.request.post(`${origin}/test/reset`, { headers: { origin }, maxRetries: 2, timeout: 30000 });
    reset = { ok: response.ok(), status: response.status() };
    if (reset.status !== 409) break;
    await page.waitForTimeout(2000);
  }
  if (!reset.ok) throw new Error(`Isolated staging reset unavailable: HTTP ${reset.status}`);
  await page.goto(loginUrl);
}

// The isolated test gateway exposes /test/install, while the real deck deliberately
// accepts only GitHub App URLs. Model that provider redirect in the browser fixture.
export const FIXTURE_INSTALL = 'https://github.com/apps/shiptorio-stub/installations/new';
export function deckFixtureIdentity(identity, persona) {
  return identity?.login === persona && /^test-(newbie|guest|midgame|broke|blocked)$/.test(persona) && identity.installUrl === '/test/install'
    ? { ...identity, installUrl: FIXTURE_INSTALL } : identity;
}

// The local provider renders at GitHub; the staging adapter redirects immediately.
// Match only these fixture destinations, never a real installation URL.
export function isFixtureInstallPage(current, origin) {
  return current.href === FIXTURE_INSTALL ||
    current.origin === origin && current.pathname === "/test/install" && !current.search;
}

// Login can immediately continue into the selected repo; the path stays the deck.
export function isFixtureDeckPage(current, origin) {
  return current.origin === origin && ["/deck", "/deck.html"].includes(current.pathname) && current.searchParams.get("source") === "live";
}
