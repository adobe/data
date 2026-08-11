// © 2026 Adobe. MIT License. See /LICENSE for details.
import { equalsUnordered } from "@adobe/data";
import { matches } from "../match/match.js";
import type { Effects } from "./types.js";

export type RecordedCall = readonly [string, ...unknown[]];

// A runtime service value: a non-array object with at least one method (mirrors
// the compile-time service detection in `types.ts`).
const isServiceValue = (value: unknown): value is object =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).some((member) => typeof member === "function");

// Wrap a plain-object service so each method call is recorded, then delegates.
// No Proxy (services are plain objects with own enumerable methods), so we
// enumerate and closure-wrap each function.
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

// Wrap the injected services IN PLACE within a case's `args` (leaving plain data
// untouched), returning the args ready to pass to a pure transform plus the
// per-service `calls` map. Used by the pure spec runner, which calls the transform
// with its full args; the ecs action runner uses `splitAndRecordServices` instead.
export const recordArgServices = <Args>(
  args: Args,
): { args: Args; calls: Record<string, RecordedCall[]> } => {
  const calls: Record<string, RecordedCall[]> = {};
  if (args === null || typeof args !== "object" || Array.isArray(args)) return { args, calls };
  const next = { ...(args as object) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(args as object)) {
    if (isServiceValue(value)) {
      const recorded = recordCalls(value);
      next[key] = recorded.service;
      calls[key] = recorded.calls;
    }
  }
  return { args: next as Args, calls };
};

// Split a case's `args` into the injected services (wrapped for recording) and
// the remaining plain data. Keyed by the same arg name so `calls` matches against
// `effects`. A no-arg case (`undefined` args) splits into nothing.
export const splitAndRecordServices = <Args>(
  args: Args,
): { services: Record<string, object>; input: Record<string, unknown>; calls: Record<string, RecordedCall[]> } => {
  const services: Record<string, object> = {};
  const input: Record<string, unknown> = {};
  const calls: Record<string, RecordedCall[]> = {};
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
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

const showCalls = (calls: unknown): string => {
  try {
    return JSON.stringify(calls) ?? String(calls);
  } catch {
    return String(calls);
  }
};

// Assert the calls recorded against one service match the case's expectation for
// it: an Array expects exactly these calls in order; a Set expects the same calls
// in any order (multiset). Absent expectation ⇒ no calls expected. Ordered calls
// compare matcher-aware, so a call arg may itself use `anyNumber`.
const expectServiceCalls = (
  key: string,
  recorded: readonly RecordedCall[],
  expected: readonly RecordedCall[] | ReadonlySet<RecordedCall> | undefined,
): void => {
  const ok =
    expected instanceof Set ? equalsUnordered(recorded, [...expected]) : matches(recorded, expected ?? []);
  if (!ok) {
    throw new Error(
      `effects mismatch on "${key}":\n  recorded: ${showCalls(recorded)}\n  expected: ${showCalls(
        expected instanceof Set ? [...expected] : (expected ?? []),
      )}`,
    );
  }
};

// Assert each service DECLARED in `effects` saw exactly its expected calls (an
// extra or missing call on a declared service fails). Services not listed — e.g. a
// value-returning read like `generateName` — are ignored, so `effects` captures the
// fire-and-forget side effects a case chooses to assert.
export const expectEffects = (
  calls: Record<string, readonly RecordedCall[]>,
  effects: Effects<Record<string, unknown>> | undefined,
): void => {
  const expected = (effects ?? {}) as Record<string, readonly RecordedCall[] | ReadonlySet<RecordedCall>>;
  for (const key of Object.keys(expected)) {
    expectServiceCalls(key, calls[key] ?? [], expected[key]);
  }
};
