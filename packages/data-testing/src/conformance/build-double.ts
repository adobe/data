// © 2026 Adobe. MIT License. See /LICENSE for details.

// A per-method FIFO response schedule, keyed by method name (a case's `responses`
// for one service, erased to data).
export type Schedule = Readonly<Record<string, readonly unknown[]>>;

// Build a recording double for one service from a SHAPE-ONLY template and a case's
// response schedule. The template — the feature's registered fake — supplies the
// method names (types are erased at runtime, and Proxy is banned on these paths), and
// one probe call per method tells a value method (returns something) from a void one
// (returns `undefined`); fakes are inert, so probing is safe. Every value-returning
// call drains that method's FIFO. Calling a value method with no response scheduled,
// or more times than scheduled, throws: a case must own every value its code reads.
//
// The returned double still gets wrapped by `recordCalls` on its way into a case's
// args, so effect assertion is unchanged; only the RETURNS come from the case.
export const buildDouble = (template: () => object, responses: Schedule | undefined): object => {
  const shape = template();
  const service = "serviceName" in shape ? String(shape.serviceName) : "service";
  const queues = new Map<string, unknown[]>(
    Object.entries(responses ?? {}).map(([method, schedule]) => [method, [...schedule]]),
  );
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => {
      if (typeof value !== "function") return [key, value]; // serviceName and other non-method members pass through
      const returnsValue = (value as () => unknown)() !== undefined;
      return [
        key,
        (..._args: unknown[]): unknown => {
          const queue = queues.get(key);
          if (queue === undefined) {
            if (!returnsValue) return undefined; // a void method
            throw new Error(`no response scheduled for "${service}.${key}"; add it to the case's responses`);
          }
          if (queue.length === 0) throw new Error(`response schedule exhausted for "${service}.${key}"`);
          return queue.shift();
        },
      ];
    }),
  );
};
