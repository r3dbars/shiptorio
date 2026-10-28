import { expect, type Page } from '@playwright/test';

export type LaunchObservation = () => Promise<void>;

// Attach the rejection handler immediately, while the player still holds the
// button; construction may outlast the card. Re-throw the original error later.
export function retainVisibilityResult(visible: Promise<void>): LaunchObservation {
  const result = visible.then(() => ({ ok: true as const }), error => ({ ok: false as const, error }));
  return async () => {
    const outcome = await result;
    if (!outcome.ok) throw outcome.error;
  };
}

export async function observeManualLaunch(page: Page): Promise<LaunchObservation> {
  expect(await page.locator('.ship-cel').count(), 'no shipment celebration before the manual Launch press').toBe(0);
  return retainVisibilityResult(expect(page.locator('.ship-cel.shipped .ship-card').first(),
    'manual Launch shows the actual shipped card').toBeVisible({ timeout: 30_000 }));
}
