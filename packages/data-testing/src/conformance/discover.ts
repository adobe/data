// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";

// One discovered `data/state` file: its function, its cases, and — when the file
// declared one — the `args` schema that marks the entity-reference args.
export interface Discovered {
  readonly fn: (...args: unknown[]) => unknown;
  readonly cases: readonly Record<string, unknown>[];
  readonly argsSchema?: Schema;
}

// Every `cases` export is the builder envelope `{ args?, cases }` (a bare array is no
// longer valid). Read the list and optional schema off it — one shape, no branch.
const normalizeCases = (raw: unknown): { list: readonly unknown[]; argsSchema?: Schema } => {
  if (raw !== null && typeof raw === "object" && Array.isArray((raw as { cases?: unknown }).cases)) {
    const { cases, args } = raw as { cases: readonly unknown[]; args?: Schema };
    return { list: cases, argsSchema: args };
  }
  return { list: [] };
};

const scan = (
  modules: Record<string, Record<string, unknown>>,
  isKind: (firstCase: Record<string, unknown>) => boolean,
): Map<string, Discovered> => {
  const out = new Map<string, Discovered>();
  for (const [path, module] of Object.entries(modules)) {
    const names = Object.keys(module);
    if (!names.includes("cases")) continue;
    const { list, argsSchema } = normalizeCases(module["cases"]);
    if (list.length === 0) continue;
    const first = list[0];
    if (typeof first !== "object" || first === null || !isKind(first as Record<string, unknown>)) continue;
    const fnName = names.find((key) => typeof module[key] === "function");
    if (!fnName) throw new Error(`${path} exports \`cases\` but no function to pair`);
    out.set(fnName, {
      fn: module[fnName] as Discovered["fn"],
      cases: list as Discovered["cases"],
      argsSchema,
    });
  }
  return out;
};

// Transitions — files whose cases are `{ before, args?, after }` — keyed by the
// transform's function name (the name the ecs transaction/action must share).
export const discoverTransitions = (modules: Record<string, Record<string, unknown>>): Map<string, Discovered> =>
  scan(modules, (c) => "after" in c);
// Derivations — files whose cases are `{ input, value }` — keyed by the
// derivation's function name (the name the ecs computed must share).
export const discoverDerivations = (modules: Record<string, Record<string, unknown>>): Map<string, Discovered> =>
  scan(modules, (c) => "value" in c);

// Normalize the ecs-op source to `name → fn`. Accepts EITHER a facet barrel
// (`import * as x` — values are the functions, keyed by export name) OR a directory
// glob (`import.meta.glob(..., { eager: true })` — values are modules, each
// contributing its function exports). The glob form finds ops that live beside a
// barrel but aren't registered in it (a conformance-only action kept out of the
// plugin facet), so they still pair by name.
export const discoverOps = (source: Record<string, unknown>): Map<string, (...a: never[]) => unknown> => {
  const out = new Map<string, (...a: never[]) => unknown>();
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "function") {
      out.set(key, value as (...a: never[]) => unknown);
    } else if (value !== null && typeof value === "object") {
      for (const [name, member] of Object.entries(value)) {
        if (typeof member === "function") out.set(name, member as (...a: never[]) => unknown);
      }
    }
  }
  return out;
};
