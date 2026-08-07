// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import type { CoreDatabase } from "../core-database/core-database.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectConforms } from "./expect-conforms.js";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { increment } from "../transaction-database/transactions/increment.js";
import { decrement } from "../transaction-database/transactions/decrement.js";
import { reset } from "../transaction-database/transactions/reset.js";
import { setUserName } from "../transaction-database/transactions/set-user-name.js";
import { clearLog } from "../transaction-database/transactions/clear-log.js";
import { cases as incrementCases } from "../../../data/state/increment.js";
import { cases as decrementCases } from "../../../data/state/decrement.js";
import { cases as resetCases } from "../../../data/state/reset.js";
import { cases as setUserNameCases } from "../../../data/state/set-user-name.js";
import { cases as clearLogCases } from "../../../data/state/clear-log.js";

// The single conformance test for every ecs transaction. Each transaction's shared
// `data/state` cases are replayed against it (`fromState(before)` → apply →
// `toState ≡ after`); half 1 of the property is covered by `data/state/spec.test.ts`,
// so no `spec` is passed here. Transaction files must stay single-export (the
// `transactions/` barrel is `export *`-ed straight into the plugin facet), so the
// wiring lives here rather than beside each transaction. The guard at the bottom
// asserts every registered transaction is wired below, so none can be missed.
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

conforms("increment", { cases: incrementCases, apply: increment });
conforms("decrement", { cases: decrementCases, apply: decrement });
conforms("reset", { cases: resetCases, apply: reset });
conforms("setUserName", { cases: setUserNameCases, apply: setUserName });
conforms("clearLog", { cases: clearLogCases, apply: clearLog });

// None-missed guard: every **registered** transaction must be wired above. Keyed
// off the barrel (the transactions the plugin actually dispatches), not a file
// glob — so a shared read helper parked flat in `transactions/` (kept out of the
// barrel) is naturally excluded.
describe("transaction conformance coverage", () => {
  for (const transaction of Object.keys(registeredTransactions)) {
    it(`${transaction} has a conformance case`, () => expect(covered.has(transaction)).toBe(true));
  }
});
