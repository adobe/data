// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import { buildDouble, type Schedule } from "./build-double.js";

type AnyFn = (...args: never[]) => unknown;
// The erased case-module shape the adapter reads structurally. The strongly-typed
// authored envelopes (`SpecCases` / `SpecDerivations`) widen to this — the runner
// only needs the case list and the optional entity-reference `args` schema.
type LooseCaseModule = { readonly args?: Schema; readonly cases: readonly Record<string, unknown>[] };

// Synthesize this case's recording doubles from the feature's shape-only `services`
// templates and the case's `responses`, then merge them into `args` where the
// transform expects each injected service. ALL registered services are injected (a
// superset): a service a transform calls but the case neither schedules nor asserts
// must still be present, and an unused one is harmless (its recorded calls aren't
// asserted). The test-only `responses` channel is dropped — it is not a fn arg.
const injectDoubles = (
  testCase: Record<string, unknown>,
  services: Readonly<Record<string, () => object>>,
): Record<string, unknown> => {
  const responses = testCase["responses"] as Readonly<Record<string, Schedule>> | undefined;
  const args = testCase["args"] as object | undefined;
  const built: Record<string, object> = {};
  for (const [name, template] of Object.entries(services)) {
    built[name] = buildDouble(template, responses?.[name]);
  }
  const { responses: _responses, args: _args, ...rest } = testCase;
  return { ...rest, args: { ...built, ...(args ?? {}) } };
};

// Adapt a manifest's `{ fns, cases }` into the `transitions` map shape the
// discovery-based runners (`runSpec` / `runFeature`) already consume: one entry per
// fn, `{ [fnName]: fn, cases: <envelope> }`. Derivation modules pass through as
// `{ cases }`; transition modules keep their optional `args` schema, and — when
// `injectServices` — gain per-case recording doubles in `args`. This is the entire
// bridge from inert, data-only cases to the unchanged runners: the pure spec and the
// ecs action side adapt WITH services (each side builds its own fresh doubles, so
// their FIFO schedules never cross); the ecs transaction side adapts WITHOUT (a
// transaction is a pure store mutation and never receives services).
export const adaptCases = (
  fns: Readonly<Record<string, AnyFn>>,
  cases: Readonly<Record<string, LooseCaseModule>>,
  services: Readonly<Record<string, () => object>> | undefined,
  injectServices: boolean,
): Record<string, Record<string, unknown>> => {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, fn] of Object.entries(fns)) {
    const module = cases[name]!;
    const list = module.cases;
    const first = list[0] as Record<string, unknown> | undefined;
    if (first !== undefined && "value" in first) {
      out[`./${name}`] = { [name]: fn, cases: { cases: list } };
      continue;
    }
    const adapted = injectServices && services ? list.map((testCase) => injectDoubles(testCase, services)) : list;
    out[`./${name}`] = {
      [name]: fn,
      cases: module.args ? { args: module.args, cases: adapted } : { cases: adapted },
    };
  }
  return out;
};
