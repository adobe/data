// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import type { CoreDatabase } from "../core-database/core-database.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectConforms } from "./expect-conforms.js";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { playMove } from "../transaction-database/transactions/play-move.js";
import { restartGame } from "../transaction-database/transactions/restart-game.js";
import { cases as playMoveCases } from "../../../data/state/play-move.js";
import { cases as restartGameCases } from "../../../data/state/restart-game.js";

// The single conformance test for every ecs transaction. Each transaction's
// shared `data/state` cases run through its raw `apply` (`fromState(before)` →
// apply → `matches(toState, after)`); the pure half is asserted once, centrally,
// by `data/state/spec.test.ts`, so this runner asserts only the ecs half. The
// guard at the bottom asserts every REGISTERED transaction (the barrel, not a
// file glob) is wired below, so the flat `readBoard` helper — kept out of the
// barrel — is naturally excluded and none can be missed.
const covered = new Set<string>();
const conforms = <Args>(
  transaction: string,
  config: {
    readonly cases: readonly ConformanceCase<Args>[];
    readonly apply: (t: CoreDatabase.Store, args: Args) => void;
  },
): void => {
  covered.add(transaction);
  describe(`${transaction} transaction conforms`, () => expectConforms(config));
};

conforms("playMove", { cases: playMoveCases, apply: playMove });
conforms("restartGame", { cases: restartGameCases, apply: (t) => restartGame(t) });

// None-missed guard: every **registered** transaction must be wired above.
describe("transaction conformance coverage", () => {
  for (const transaction of Object.keys(registeredTransactions)) {
    it(`${transaction} has a conformance case`, () => expect(covered.has(transaction)).toBe(true));
  }
});
