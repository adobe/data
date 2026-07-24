// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Whole-tick conformance: one frame of the ECS system loop must produce the
// same logical `State` as one `data/` `State.step`. Reuses the feature
// projection (`ecs/conformance/`) over the SHARED `step` cases — the same
// `{ before, args, after }` array the pure `State.step` spec test runs — so
// this is "substitute the implementation, reuse the truth".
//
// Systems run through `db.system.functions`, so unlike a transaction they need
// the assembled database, obtained cast-free via `createSystemDatabase` (the
// writable-store lens). Per case: seed `fromState(db.store, before)`, seed the
// fixed-timestep `frameDelta` (a resource with no `data/` analogue, written
// straight to the store as the oracle is fed `args.dt`) and the player `input`,
// drive one headless frame, then assert `toState(db.store) ≡ after`. Each case
// also asserts `State.step ≡ after` first, keeping the shared case honest.
import { describe, it } from "vitest";
import { State } from "../../data/state/state.js";
import { cases } from "../../data/state/step.cases.js";
import { expectStateMatches } from "../../data/state/expect-state-matches.js";
import { createSystemDatabase } from "../conformance/create-system-database.js";
import { fromState } from "../conformance/from-state.js";
import { toState } from "../conformance/to-state.js";
import { driveFrame } from "../conformance/drive-frame.js";

describe("ECS system tick loop conforms to State.step (one frame = one step)", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      const { dt, input } = testCase.args;
      expectStateMatches(State.step(testCase.before, dt, input), testCase.after);

      const db = createSystemDatabase();
      fromState(db.store, testCase.before);
      db.store.resources.frameDelta = dt;
      db.transactions.setInput(input);
      driveFrame(db);
      expectStateMatches(toState(db.store), testCase.after);
    });
  }
});
