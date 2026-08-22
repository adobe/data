// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "../index.js";

// Non-empty discovery: one pure transition with co-located cases still pairs and
// asserts as before (empty-discovery path must not break populated specs).
const increment = (
  state: { n: number },
  { by }: { by: number },
): { n: number } => ({ n: state.n + by });

// A `throws` case: no `after`/`effects`, just an optional message substring.
const withdraw = (
  state: { n: number },
  { amount }: { amount: number },
): { n: number } => {
  if (amount > state.n) throw new Error(`insufficient funds: have ${state.n}, want ${amount}`);
  return { n: state.n - amount };
};

Conformance.runSpec({
  state: { create: () => ({ n: 0 }) },
  transitions: {
    "./increment.ts": {
      increment,
      // A module's `cases` export is the builder envelope `{ cases }` (bare arrays are
      // no longer valid); build it directly so run-spec reads the same shape.
      cases: {
        cases: [
          {
            name: "adds the delta over State.create()",
            before: {},
            args: { by: 2 },
            after: { n: 2 },
          },
          {
            name: "honors a non-default before delta",
            before: { n: 10 },
            args: { by: 1 },
            after: { n: 11 },
          },
        ],
      },
    },
    "./withdraw.ts": {
      withdraw,
      cases: {
        cases: [
          {
            name: "withdraws within balance",
            before: { n: 10 },
            args: { amount: 4 },
            after: { n: 6 },
          },
          {
            name: "throws on any error when `throws: true`",
            before: { n: 10 },
            args: { amount: 11 },
            throws: true,
          },
          {
            name: "throws with a message containing the given substring",
            before: { n: 10 },
            args: { amount: 11 },
            throws: "insufficient funds",
          },
        ],
      },
    },
  },
});
