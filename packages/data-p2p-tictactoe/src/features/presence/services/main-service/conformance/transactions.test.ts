// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import type { CoreDatabase } from "../core-database/core-database.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectConforms } from "./expect-conforms.js";
import { seedUserId } from "./seed-user-id.js";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { movePresence } from "../transaction-database/transactions/move-presence.js";
import { cases as movePresenceCases } from "../../../data/state/move-presence.js";

// The single conformance test for every ecs transaction. `movePresence` reads the
// peer identity from the transaction `userId` (the peer's assigned mark), so the
// `apply` closure seeds that identity from the case's `mark`, then dispatches the
// raw transaction with the plain `{ x, y }` payload. The guard asserts every
// REGISTERED transaction (the barrel) is wired below.
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

conforms("movePresence", {
  cases: movePresenceCases,
  apply: (store, { mark, x, y }) => {
    seedUserId(store, mark);
    movePresence(store, { x, y });
  },
});

// None-missed guard: every **registered** transaction must be wired above.
describe("transaction conformance coverage", () => {
  for (const transaction of Object.keys(registeredTransactions)) {
    it(`${transaction} has a conformance case`, () => expect(covered.has(transaction)).toBe(true));
  }
});
