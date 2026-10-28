import { expect, test } from 'bun:test';
import { securityHeaders } from '../../server/src/security';

test('judge permits injected Cloudflare beacon without widening private or gate script policies', () => {
  const policy = (path: string, gate?: string) => securityHeaders(new Request(`https://shiptorio.com${path}`), undefined, false, undefined, gate)['Content-Security-Policy'];
  expect(policy('/judge')).toContain("script-src 'self' https://static.cloudflareinsights.com;");
  expect(policy('/judge')).toContain("connect-src 'self' wss://shiptorio.com https://cloudflareinsights.com;");
  expect(policy('/')).not.toContain('cloudflareinsights.com');
  const nonce = 'a'.repeat(32);
  expect(policy('/judge', `script-src 'nonce-${nonce}'`)).toContain(`script-src 'nonce-${nonce}';`);
});
