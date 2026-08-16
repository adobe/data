// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { adaptArgs } from "./entity-ref.js";
import { refifyState } from "./refify.js";
import { recordArgServices, expectEffects } from "./record-effects.js";
import type { DerivationCase, Effects } from "./types.js";

const isDerivationCase = (c: unknown): c is DerivationCase<unknown, unknown> =>
  typeof c === "object" && c !== null && "value" in c;

export interface SpecRunConfig {
  // The feature's `State` namespace (the same `state` `runFeature` takes). Its
  // `create()` is the default each case's `before` deltas over, so a case names
  // only the fields it sets differently. Omit it and cases must carry a full `before`.
  readonly state?: { create(): object };
  // `import.meta.glob(["./*.ts", "!./*.test.ts", "!./*.type-test.ts"], { eager: true })`
  // — the same `transitions` glob `runFeature` takes.
  readonly transitions: Record<string, Record<string, unknown>>;
  // Passed through to `matches` (float tolerance). Ordered vs. unordered is now
  // carried by the value's type — `Array` positional, `Set`/`Map` order-independent.
  readonly match?: MatchOptions;
  // Override the `describe` label per module (default `State.<fnName>`).
  readonly label?: (path: string, fnName: string | undefined) => string;
}

type InvalidSuite = {
  readonly kind: "invalid";
  readonly path: string;
  readonly label: string;
  readonly exportNames: readonly string[];
};

type CasesSuite = {
  readonly kind: "cases";
  readonly label: string;
  readonly fn: (...args: unknown[]) => unknown;
  readonly cases: readonly unknown[];
};

type Suite = InvalidSuite | CasesSuite;

// The single pure-spec test for every transform AND derivation in a `data/state/`
// folder. It auto-discovers each file that exports `cases`, requires that file to
// export exactly its function plus `cases`, and dispatches on case shape: a `value`
// case checks a derivation `(state) => value`; otherwise a transition `(state,
// args) => state`, whose declared `effects` on injected services are also asserted.
// A service-injected transition is async, so results are awaited uniformly.
//
// Features with empty `State` and no pure transforms still keep a one-line
// `spec.test.ts` that calls `runSpec`. When discovery finds zero case modules (or
// only empty `cases: []` arrays), Vitest would otherwise fail the file with
// "No test suite found" — so we register a single no-op so empty discovery is a
// valid outcome, not an error.
export const runSpec = (config: SpecRunConfig): void => {
  const suites: Suite[] = [];
  for (const [path, module] of Object.entries(config.transitions)) {
    const exportNames = Object.keys(module);
    if (!exportNames.includes("cases")) continue;
    const functionNames = exportNames.filter(
      (key) => typeof module[key] === "function",
    );
    const fnName = functionNames.length === 1 ? functionNames[0] : undefined;
    const label = config.label
      ? config.label(path, fnName)
      : `State.${fnName ?? path}`;
    if (exportNames.length !== 2 || functionNames.length !== 1) {
      suites.push({ kind: "invalid", path, label, exportNames });
      continue;
    }
    const cases = module["cases"] as readonly unknown[];
    // Empty `cases: []` is not a suite (and would open a Vitest describe with no
    // tests, which fails even when this file has other suites).
    if (cases.length === 0) continue;
    suites.push({
      kind: "cases",
      label,
      fn: module[functionNames[0]!] as (...args: unknown[]) => unknown,
      cases,
    });
  }

  if (suites.length === 0) {
    it("has no pure transitions to specify", () => {
      // intentional no-op — empty discovery is a valid feature shape
    });
    return;
  }

  for (const suite of suites) {
    describe(suite.label, () => {
      if (suite.kind === "invalid") {
        it("exports exactly its function and `cases`", () => {
          throw new Error(
            `${suite.path} exports [${suite.exportNames.join(", ")}] — expected one function + cases`,
          );
        });
        return;
      }
      for (const testCase of suite.cases) {
        if (isDerivationCase(testCase)) {
          it(testCase.name, () =>
            assert(suite.fn(testCase.input), testCase.value, config.match),
          );
          continue;
        }
        const tc = testCase as {
          readonly name: string;
          readonly before: unknown;
          readonly args?: unknown;
          readonly after: unknown;
          readonly effects?: Effects<Record<string, unknown>>;
        };
        it(tc.name, async () => {
          // Unwrap `entity(specId)` markers to their data-id for the pure spec, then
          // wrap injected services so their calls are recorded.
          const { args, calls } = recordArgServices(adaptArgs(tc.args));
          // Case `before` is a delta over the feature default; `after` a writes patch.
          const before = {
            ...(config.state?.create() ?? {}),
            ...(tc.before as Record<string, unknown>),
          };
          const result = (await suite.fn(before, args)) as Record<string, unknown>;
          // The pure transform mints its own spec-ids, so compare up to an
          // id-bijection too: refify the expected's entity map keys into `ref`s. No
          // store here, so only keys (an id by construction) are refified — a pure
          // spec whose entity values also carry reference fields is not a shape any
          // feature has yet, and would seed those from the ecs schemas via `runFeature`.
          assert(
            { ...before, ...result },
            refifyState({ ...before, ...(tc.after as Record<string, unknown>) }, { componentSchemas: {} }),
            config.match,
          );
          expectEffects(calls, tc.effects);
        });
      }
    });
  }
};
