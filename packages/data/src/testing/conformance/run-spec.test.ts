// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "../index.js";

// Non-empty discovery: one pure transition with co-located cases still pairs and
// asserts as before (empty-discovery path must not break populated specs).
const increment = (
  state: { n: number },
  { by }: { by: number },
): { n: number } => ({ n: state.n + by });

Conformance.runSpec({
  state: { create: () => ({ n: 0 }) },
  transitions: {
    "./increment.ts": {
      increment,
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
});
