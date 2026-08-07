// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { adaptArgs } from "./entity-ref.js";
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
  // Passed through to `matches` (float tolerance, unordered collections).
  readonly match?: MatchOptions;
  // Override the `describe` label per module (default `State.<fnName>`).
  readonly label?: (path: string, fnName: string | undefined) => string;
}

// The single pure-spec test for every transform AND derivation in a `data/state/`
// folder. It auto-discovers each file that exports `cases`, requires that file to
// export exactly its function plus `cases`, and dispatches on case shape: a `value`
// case checks a derivation `(state) => value`; otherwise a transition `(state,
// args) => state`, whose declared `effects` on injected services are also asserted.
// A service-injected transition is async, so results are awaited uniformly.
export const runSpec = (config: SpecRunConfig): void => {
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
    describe(label, () => {
      if (exportNames.length !== 2 || functionNames.length !== 1) {
        it("exports exactly its function and `cases`", () => {
          throw new Error(
            `${path} exports [${exportNames.join(", ")}] — expected one function + cases`,
          );
        });
        return;
      }
      // Runtime invariant: a participating file exports one function and its cases.
      const fn = module[functionNames[0]] as (...args: unknown[]) => unknown;
      const cases = module["cases"] as readonly unknown[];
      for (const testCase of cases) {
        if (isDerivationCase(testCase)) {
          it(testCase.name, () =>
            assert(fn(testCase.input), testCase.value, config.match),
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
          const result = (await fn(before, args)) as Record<string, unknown>;
          assert(
            { ...before, ...result },
            { ...before, ...(tc.after as Record<string, unknown>) },
            config.match,
          );
          expectEffects(calls, tc.effects);
        });
      }
    });
  }
};
