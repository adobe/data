// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Whole-tick conformance: one frame of the ECS system loop must produce the same
// logical `State` as one `data/` `State.step`. Reuses the feature projection over
// the SHARED `step` cases — the same `{ before, args, after }` array the pure
// `State.step` spec test runs — so this is "substitute the implementation, reuse
// the truth".
//
// Systems run through `db.system.functions`, so unlike a transaction they need the
// assembled database, obtained cast-free via `createSystemDatabase` (the
// writable-store lens). Per case: seed `fromState(db.store, before)`, seed the
// frame `frameDelta` (a resource with no `data/` analogue, written straight to the
// store as the oracle is fed `dt`), and — crucially — seed NO pending input, so
// the per-frame systems' combined effect equals `State.step(before, dt)` exactly
// (hop is covered by the transaction conformance). Then drive one headless frame
// and assert `toState ≡ after`. Each case also asserts `State.step ≡ after` first,
// keeping the shared case honest. The hazards live in the identity-keyed
// `entities` `ReadonlyMap`, so `assertState` matches them order-independently and up
// to an id-bijection (the ecs, and the pure spawn, mint their own ids — the case's
// plain spec-ids need only correspond).
import { describe, it } from "vitest";
import { Conformance } from "@adobe/data-testing";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/step.js";
import { createSystemDatabase } from "../conformance/create-system-database.js";
import { projection } from "../conformance/projection.js";
import { driveFrame } from "../conformance/drive-frame.js";

describe("ECS system tick loop conforms to State.step (one frame = one step)", () => {
  for (const testCase of cases.cases) {
    it(testCase.name, () => {
      const dt = testCase.args;
      // A case `before` is a delta over the feature default and `after` a writes
      // patch (`Case.before`/`after` are `Partial<State>`), so materialise the full
      // seed and the full expected state the same way the runners do. `db.store`
      // supplies the schemas `assertState` reads to compare up to an id-bijection.
      const before = { ...State.create(), ...testCase.before };
      const expected = { ...before, ...testCase.after };
      const db = createSystemDatabase();
      Conformance.assertState({ ...before, ...State.step(before, dt) }, expected, db.store);

      projection.fromState(db.store, before);
      db.store.resources.frameDelta = dt;
      driveFrame(db);
      Conformance.assertState(projection.toState(db.store), expected, db.store);
    });
  }
});
