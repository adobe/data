// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it } from "vitest";
import type { State } from "./state.js";
import type { ConformanceCase, DerivationCase } from "./conformance-case.js";
import { expectStateMatches, expectMatches } from "./expect-state-matches.js";
import { recordArgServices, expectEffects } from "./record-effects.js";

// The single spec test for every transform AND derivation in this folder. It
// auto-discovers each file (any sibling `.ts` that exports `cases`) via
// `import.meta.glob`, so a new one is covered the moment it ships — none can be
// forgotten. Each participating file must export exactly its function plus `cases`
// (enforced below), which lets us find the function without it being named twice.
// A case's shape selects the check: `after` → a transition `(state, args) => state`;
// `value` → a derivation `(state) => value`.
const modules = import.meta.glob<Record<string, unknown>>(
  ["./*.ts", "!./*.test.ts", "!./*.type-test.ts"],
  { eager: true },
);

const isDerivationCase = (c: unknown): c is DerivationCase<unknown, unknown> =>
  typeof c === "object" && c !== null && "value" in c;

for (const [path, module] of Object.entries(modules)) {
  const exportNames = Object.keys(module);
  if (!exportNames.includes("cases")) continue;
  const functionNames = exportNames.filter((key) => typeof module[key] === "function");
  const label = functionNames.length === 1 ? functionNames[0] : path;

  describe(`State.${label}`, () => {
    if (exportNames.length !== 2 || functionNames.length !== 1) {
      it("exports exactly its function and `cases`", () => {
        throw new Error(`${path} exports [${exportNames.join(", ")}] — expected one function + cases`);
      });
      return;
    }
    // Runtime invariant: a participating file exports a function and its cases.
    const fn = module[functionNames[0]] as (...args: unknown[]) => unknown;
    const cases = module["cases"] as readonly unknown[];
    for (const testCase of cases) {
      if (isDerivationCase(testCase)) {
        // Derivation: the value it yields matches, honoring `anyNumber`.
        it(testCase.name, () => expectMatches(fn(testCase.input), testCase.value));
        continue;
      }
      // Transition: assert the resulting state and the declared side effects.
      // A service-injected transition is async, so await uniformly.
      const transitionCase = testCase as ConformanceCase<Record<string, unknown>>;
      it(transitionCase.name, async () => {
        const raw = transitionCase.args;
        const { args, calls } =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? recordArgServices(raw)
            : { args: raw, calls: {} };
        const result = (await fn(transitionCase.before, args)) as State;
        expectStateMatches(result, transitionCase.after);
        expectEffects(calls, transitionCase.effects);
      });
    }
  });
}
