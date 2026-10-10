// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";

/**
 * Combines named observe functions into one whose value has the same keys, without
 * waiting for all of them: a member that has not yet emitted reads as `undefined`
 * (never a valid `Data` value, so it unambiguously means "not resolved yet").
 *
 * Emits synchronously once on subscribe with whatever resolved synchronously, then at
 * most once per microtask however many members change within it.
 */
export function fromPartialProperties<T extends { readonly [K: string]: Observe<unknown> }>(
  observeProperties: T,
): Observe<{ readonly [K in keyof T]: (T[K] extends Observe<infer U> ? U : never) | undefined }> {
  type Values = { readonly [K in keyof T]: (T[K] extends Observe<infer U> ? U : never) | undefined };
  return (observer) => {
    const values: Record<string, unknown> = {};
    for (const key of Object.keys(observeProperties)) values[key] = undefined;
    let initializing = true;
    let scheduled = false;
    let active = true;
    // Every key of `T` is assigned above, and each value is the latest from that key's observe.
    const notify = () => observer({ ...values } as Values);
    const unobservers = Object.entries(observeProperties).map(([key, observe]) =>
      observe((value) => {
        values[key] = value;
        if (initializing || scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          if (active) notify();
        });
      }),
    );
    initializing = false;
    notify();
    return () => {
      active = false;
      for (const unobserve of unobservers) unobserve();
    };
  };
}
