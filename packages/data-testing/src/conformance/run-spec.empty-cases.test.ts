// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "../index.js";

// Module with `cases: []` opens an empty `describe` and used to leave the file
// suite-less. Empty discovery registers a no-op so Vitest still collects a suite.
Conformance.runSpec({
  state: { create: () => ({ n: 0 }) },
  transitions: {
    "./empty-cases.ts": {
      noop: (state: { n: number }) => state,
      cases: [],
    },
  },
});
