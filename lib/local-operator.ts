import { AsyncLocalStorage } from 'node:async_hooks';
import { Server } from 'node:http';

const STORE = Symbol.for('flightdeck.operator-client');

type OperatorGlobal = typeof globalThis & {
  [STORE]?: AsyncLocalStorage<string | undefined>;
};

/** Shared across bundles in this process. The route and the server patch must see one store. */
const operatorClient = ((globalThis as OperatorGlobal)[STORE] ??= new AsyncLocalStorage<string | undefined>());

const PATCHED = Symbol.for('flightdeck.operator-client-patched');

/** True for 127.0.0.0/8 and ::1, including IPv4-mapped IPv6. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  if (ip === '::1') return true;
  const parts = ip.split('.');
  if (parts.length !== 4 || parts[0] !== '127') return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/**
 * Record the TCP peer for the current request.
 * Call once at server start, before the process accepts connections.
 */
export function patchOperatorClient(): void {
  const proto = Server.prototype as typeof Server.prototype & { [PATCHED]?: true };
  if (proto[PATCHED]) return;
  const emit = proto.emit;
  proto.emit = function (this: Server, event: string | symbol, ...args: unknown[]) {
    if (event !== 'request') return emit.apply(this, [event, ...args] as never);
    const req = args[0] as { socket?: { remoteAddress?: string } } | undefined;
    return operatorClient.run(req?.socket?.remoteAddress, () => emit.apply(this, [event, ...args] as never));
  };
  proto[PATCHED] = true;
}

/** Error when this process must refuse a caller that is not on this machine. */
export function localOperatorBlock(): string | null {
  if (process.env.FLIGHTDECK_ALLOW_REMOTE === '1') return null;
  if (isLoopbackAddress(operatorClient.getStore())) return null;
  return 'Bulk replace refused the request. Only this machine can call it.';
}

/** Test hook. Production requests enter through `patchOperatorClient`. */
export function runAsOperatorClient<T>(address: string | undefined, fn: () => T): T {
  return operatorClient.run(address, fn);
}
