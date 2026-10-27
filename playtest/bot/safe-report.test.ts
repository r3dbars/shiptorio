import { expect, test } from "bun:test";
// @ts-ignore Shared report helper runs in Node's browser-test process.
import { safeReportFailure } from "./safe-report.mjs";
test("browser report excludes authenticated Playwright request transcripts", () => {
 const output=safeReportFailure('Error: apiRequestContext.post: read ECONNRESET\nCall log:\n  - cookie: shiptorio_access=private-preview; shiptorio_session=private-session\n  - authorization: Bearer private-token');
 expect(output).toBe('Error: apiRequestContext.post: read ECONNRESET');
 expect(output).not.toContain('private-');
});
test("browser report redacts credentials outside Playwright call logs",()=>{
 const output=safeReportFailure('Cookie: shiptorio_session=sensitive\nAuthorization: Bearer credential\nhttps://example.test/?token=hidden&code=hidden');
 expect(output).not.toContain('sensitive');expect(output).not.toContain('credential');expect(output).not.toContain('hidden');expect(output).toContain('[redacted]');
});
test("secret canaries cannot escape nested errors, headers, cookies or report JSON", async()=>{
 const {safeReportValue}=await import('./safe-report.mjs');
 const canary='PRIVATE_REPORT_CANARY_92';
 const nested=new Error(`apiRequestContext.post: ECONNRESET\nCall log:\n cookie: ${canary}`,{cause:{headers:{cookie:canary,Authorization:`Bearer ${canary}`},data:{client_secret:canary,apiKey:canary}}});
 const report=safeReportValue({failures:[nested,`Console: {"headers":{"cookie":"${canary}","authorization":"Bearer ${canary}"}}`],headers:new Headers({'set-cookie':`shiptorio_session=${canary}`})});
 const serialized=JSON.stringify(report);
 expect(serialized).not.toContain(canary);expect(serialized).toContain('ECONNRESET');expect(serialized).toContain('[redacted]');
});
