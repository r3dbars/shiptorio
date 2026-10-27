import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuotaNotice, type Limits } from "../src/ui/QuotaCard";
const data: Limits = { disabled: false, retries: [], quotas: [{ id: 'runs', label: 'Build runs / day', used: 16, limit: 20, status: 'warning', resetsAt: Date.parse('2026-10-27T00:00:00Z'), raiseUrl: '/admin/signup?login=owner' }] };
const html = (d: Limits | null, error?: string) => renderToStaticMarkup(<QuotaNotice data={d} error={error} onBudget={() => {}} />);
test('near and hit quota cards name the limit, usage, reset timestamp and owner raise destination', () => {
  const warning = html(data);
  for (const text of ['Factory limits', 'Build runs / day: near limit', '16 / 20', '00:00 UTC', '2026-10-27T00:00:00.000Z', 'href="/admin/signup?login=owner"', 'Raise limit']) expect(warning).toContain(text);
  expect(html({ ...data, quotas: [{ ...data.quotas[0], used: 20, status: 'stopped' }] })).toContain('limit reached');
  expect(html({ ...data, quotas: [{ ...data.quotas[0], used: 0, status: 'ok' }] })).toBe('');
});
test('collaborators see owner guidance, retry backoff has no build charge, and refresh failures remain visible', () => {
  const guest = html({ ...data, quotas: [{ ...data.quotas[0], raiseUrl: null }] });
  expect(guest).not.toContain('/admin/signup'); expect(guest).toContain('Ask the owner');
  expect(html({ disabled: false, quotas: [], retries: [{ itemId: 'gh-42', failures: 3, retryAt: data.quotas[0].resetsAt!, reason: 'Planner offline' }] })).toContain('3/3 failed tries today. No build run charged.');
  expect(html(null, 'Factory limits unavailable.')).toContain('refresh automatically');
});
