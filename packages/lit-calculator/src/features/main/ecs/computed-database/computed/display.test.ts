// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The `display` computed is a pure identity wiring of the `calculator` resource
// observable through the already-tested `State.display`. These assertions cover
// only the wiring — that the observable tracks the resource and reflects it
// through `State.display` — not `State.display`'s logic (see data/state).
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";
import { Digit } from "../../../data/digit/digit.js";
import { State } from "../../../data/state/state.js";
import { ComputedDatabase } from "../computed-database.js";

describe("display computed wires the calculator resource through State.display", () => {
  it("emits the initial display", async () => {
    const db = Database.create(ComputedDatabase.plugin);
    expect(await Observe.toPromise(db.computed.display)).toBe(
      State.display(db.resources.calculator),
    );
  });

  it("tracks the resource after a transaction", async () => {
    const db = Database.create(ComputedDatabase.plugin);
    const [first] = Digit.values;
    db.transactions.inputDigit(first);
    expect(await Observe.toPromise(db.computed.display)).toBe(
      State.display(db.resources.calculator),
    );
  });
});
