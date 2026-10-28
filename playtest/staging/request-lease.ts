/** A socket upgrade must not wait for the reset guard's durable lease release.
 * The provider retains its expiring lease until cleanup succeeds; failure remains
 * fail-closed for reset, and never turns a valid upgrade into a broken response.
 */
export async function settleFixtureLease(upgraded: boolean, release: () => Promise<unknown>, ctx: Pick<ExecutionContext, "waitUntil">): Promise<void> {
  const cleanup = release().catch(() => undefined);
  if (upgraded) ctx.waitUntil(cleanup);
  else await cleanup;
}
