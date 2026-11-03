// Walk Shippy's guest tour to its "Build mine" ask, the way a player does: Next on each card (a story card's first tap
// may only finish its typed line), held press on Ship it. There is no Skip (Justin 2026-10-30), so every run reads it all.
export async function walkTour(page, { timeout = 45000 } = {}) {
  const ask = page.locator('.ic-card:not(.ic-ghost)').getByRole('button', { name: 'Build mine', exact: true });
  for (let n = 0; n < 120 && !(await ask.count()); n++) {
    const beat = page.locator('.ic-card:not(.ic-ghost)[data-card^="tour-"] .approve');
    await Promise.race([beat.first().waitFor({ timeout }).catch(() => {}), ask.waitFor({ timeout }).catch(() => {})]);
    if (await ask.count()) break;
    const shown = page.locator('.ic-card:not(.ic-ghost)[data-card^="tour-"]').first();
    const hold = await shown.evaluate(el => el.classList.contains('hold')).catch(() => false);
    await beat.first().click(hold ? { delay: 1200 } : {}).catch(() => {}); // a card can leave between the wait and the click
  }
  await ask.waitFor({ state: 'visible', timeout });
}
