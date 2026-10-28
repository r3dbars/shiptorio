import { test, expect } from '@playwright/test';

test('waitlist dialog persists a normalized email once in D1', async ({ page, context, request }, info) => {
  const index = ['desktop', 'iphone-14', 'pixel-7'].indexOf(info.project.name) + 1;
  await context.setExtraHTTPHeaders({ 'cf-connecting-ip': `198.51.100.${index}` });
  const email = `waitlist-${info.project.name}@example.test`;
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/welcome/index.html');
    await page.getByRole('button', { name: 'Join the waitlist', exact: true }).click();
    await page.getByLabel('Email address').fill(attempt ? email.toUpperCase() : email);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText("You're on the waitlist.");
    await expect(page.locator('#join')).toBeHidden();
  }
  const receipt = await request.get(`/__test/waitlist?email=${encodeURIComponent(email)}`);
  expect(await receipt.json()).toEqual([{ identity: email, kind: 'email', status: 'pending' }]);
});

for (const [name, status, contentType, body] of [
  ['an HTML success page', 200, 'text/html', '<!doctype html><title>Sign in</title>'],
  ['a JSON body without a save receipt', 200, 'application/json', '{}'],
  ['a redirect instead of a save', 302, 'text/html', ''],
  ['a database failure', 503, 'application/json', '{"error":"Temporarily unavailable"}'],
] as const) {
  test(`waitlist never reports a saved email for ${name}`, async ({ page }) => {
    await page.route('**/api/waitlist', route => route.fulfill({ status, contentType, body, headers: status === 302 ? { location: '/welcome/index.html' } : undefined }));
    await page.goto('/welcome/index.html');
    await page.getByRole('button', { name: 'Join the waitlist', exact: true }).click();
    await page.getByLabel('Email address').fill('retry@example.test');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(/Couldn't join right now|Couldn't reach the factory|Temporarily unavailable/);
    await expect(page.locator('#join')).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveValue('retry@example.test');
    await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeEnabled();
  });
}
