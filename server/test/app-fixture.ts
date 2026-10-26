import { app } from '../src/index';
import { inTrace, type Trace } from '../src/telemetry';
// Exercise real route middleware with RPC-capable in-memory factory stubs.
export const testApp = {
  async fetch(request: Request, env: any, ctx?: any) {
    const pending: Promise<unknown>[] = [];
    const bindings = { ...env };
    if (env.FACTORY) bindings.FACTORY = { ...env.FACTORY, get(id: unknown) {
      const stub = env.FACTORY.get(id);
      return { ...stub, observedCall(method: string, args: unknown[], trace: Trace) {
        return inTrace(trace, bindings, task => pending.push(task), () => stub[method](...args));
      } };
    } };
    const response = await app.fetch(request, bindings, ctx ?? { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} });
    await Promise.all(pending);
    return response;
  },
};
