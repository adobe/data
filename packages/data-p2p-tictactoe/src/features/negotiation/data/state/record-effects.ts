// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import { equalsUnordered } from "@adobe/data";
import type { Effects } from "./conformance-case.js";

export type RecordedCall = readonly [string, ...unknown[]];

// Wrap a plain-object service so each method call is recorded, then delegates.
// No Proxy (services are plain objects with own enumerable methods — see
// `service.md`), so we enumerate and closure-wrap each function.
export const recordCalls = <S extends object>(service: S): { service: S; calls: RecordedCall[] } => {
  const calls: RecordedCall[] = [];
  const wrapped = Object.fromEntries(
    Object.entries(service).map(([key, value]) => [
      key,
      typeof value === "function"
        ? (...args: unknown[]): unknown => {
            calls.push([key, ...args]);
            return (value as (...a: unknown[]) => unknown)(...args);
          }
        : value,
    ]),
  ) as S;
  return { service: wrapped, calls };
};

// Assert the calls recorded against one service match the case's expectation for
// it: an Array expects exactly these calls in order; a Set expects the same calls
// in any order (multiset). Absent expectation ⇒ no calls expected.
export const expectServiceCalls = (
  recorded: readonly RecordedCall[],
  expected: readonly RecordedCall[] | ReadonlySet<RecordedCall> | undefined,
): void => {
  if (expected instanceof Set) {
    expect(equalsUnordered(recorded, [...expected])).toBe(true);
  } else {
    expect(recorded).toEqual(expected ?? []);
  }
};

// Split a case's `args` into the injected services (objects with methods) and the
// remaining plain data. Services are wrapped for recording; the returned `calls`
// map is keyed by the same arg key so it can be matched against `effects`.
export const recordArgServices = <Args extends object>(
  args: Args,
): { args: Args; calls: Record<string, RecordedCall[]> } => {
  const calls: Record<string, RecordedCall[]> = {};
  const next = { ...args } as Record<string, unknown>;
  for (const [key, value] of Object.entries(args)) {
    if (isServiceValue(value)) {
      const rec = recordCalls(value);
      next[key] = rec.service;
      calls[key] = rec.calls;
    }
  }
  return { args: next as Args, calls };
};

// Assert each service **declared** in `effects` saw exactly its expected calls
// (an extra or missing call on a declared service fails). Services not listed —
// e.g. a value-returning dependency read — are ignored, so `effects` captures the
// fire-and-forget side effects you choose to assert.
export const expectEffects = (
  calls: Record<string, readonly RecordedCall[]>,
  effects: Effects<Record<string, unknown>> | undefined,
): void => {
  const expected = (effects ?? {}) as Record<string, readonly RecordedCall[] | ReadonlySet<RecordedCall>>;
  for (const key of Object.keys(expected)) {
    expectServiceCalls(calls[key] ?? [], expected[key]);
  }
};

// Split a case's `args` into the injected services (wrapped for recording, to be
// used as `Database.create` service overrides) and the remaining plain data (the
// action input). Keyed by the same arg name so `calls` matches against `effects`.
export const splitAndRecordServices = <Args>(
  args: Args,
): {
  services: Record<string, object>;
  input: Record<string, unknown>;
  calls: Record<string, RecordedCall[]>;
} => {
  const services: Record<string, object> = {};
  const input: Record<string, unknown> = {};
  const calls: Record<string, RecordedCall[]> = {};
  // A no-arg transition has `undefined` args — nothing to split.
  if (args !== null && typeof args === "object") {
    for (const [key, value] of Object.entries(args)) {
      if (isServiceValue(value)) {
        const recorded = recordCalls(value);
        services[key] = recorded.service;
        calls[key] = recorded.calls;
      } else {
        input[key] = value;
      }
    }
  }
  return { services, input, calls };
};

// A runtime service value: a non-array object with at least one method (mirrors
// the compile-time `IsService`).
const isServiceValue = (value: unknown): value is object =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).some((member) => typeof member === "function");
