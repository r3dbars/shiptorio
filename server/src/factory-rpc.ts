import { log, type Trace } from './telemetry';

type RpcTarget = { observedCall(method: string, args: unknown[], trace: Trace): Promise<unknown> };
/** Rolling deploys must remain callable while a factory still exposes the previous interface. */
export async function factoryRpc(target: RpcTarget, method: string, args: unknown[], trace: Trace): Promise<unknown> {
  try { return await target.observedCall(method, args, trace); }
  catch (error) {
    // This dispatch failure occurs before any operation ran. Never retry a business error.
    if (!(error instanceof Error) || error.message !== 'The RPC receiver does not implement the method "observedCall".') throw error;
    log('warn', 'factory.rpc_legacy', { ...trace, method });
    const legacy = (target as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[method];
    return Reflect.apply(legacy, target, args);
  }
}
