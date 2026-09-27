// © 2026 Adobe. MIT License. See /LICENSE for details.

// A per-method FIFO response schedule, keyed by method name (a case's `responses`
// for one service, erased to data).
export type Schedule = Readonly<Record<string, readonly unknown[]>>;

// Build a recording double for one service from a SHAPE-ONLY template and a case's
// response schedule. The template — the feature's registered fake — is called once
// purely to enumerate the service's members (types are erased at runtime, and Proxy
// is banned on these paths, so the method names must come from a real value); its
// own behavior is never used. Every value-returning call drains that method's FIFO;
// a `void` method (or any method with no schedule) returns `undefined`. Draining an
// EXHAUSTED schedule throws, so a transform that calls a method more times than the
// case scheduled is a hard failure — the determinism a conformance oracle needs
// (the old fakes cycled, silently masking an over-call).
//
// The returned double still gets wrapped by `recordCalls` (call recording) on its
// way into a case's args, exactly like the live fakes it replaces — so effect
// assertion is unchanged; only the RETURNS now come from the case, not the fake.
export const buildDouble = (template: () => object, responses: Schedule | undefined): object => {
  const shape = template();
  const queues = new Map<string, unknown[]>(
    Object.entries(responses ?? {}).map(([method, schedule]) => [method, [...schedule]]),
  );
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) =>
      typeof value !== "function"
        ? [key, value] // serviceName and other non-method members pass through
        : [
            key,
            (..._args: unknown[]): unknown => {
              const queue = queues.get(key);
              if (!queue) return undefined; // void method, or an unscheduled call
              if (queue.length === 0) throw new Error(`response schedule exhausted for "${key}"`);
              return queue.shift();
            },
          ],
    ),
  );
};
