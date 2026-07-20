// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Conformance: every ECS transaction must produce the same logical `State` as
// its `data/` spec transform. The `state` computed projects the ECS back to
// `State`; since tic-tac-toe's State carries no entity ids, the comparison is
// exact.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { State } from "../../data/state/state.js";
import { state as stateComputed } from "../computed/state.js";
import { ComputedDatabase } from "../computed-database.js";

const read = (db: ComputedDatabase): State => {
  let value!: State;
  const unsub = stateComputed(db)((v) => { value = v; });
  unsub?.();
  return value;
};

describe("ECS transactions conform to the data/ State spec", () => {
  it("playMove matches State.playMove at every step of a game", () => {
    const db = Database.create(ComputedDatabase.plugin);
    for (const index of [4, 0, 8, 2, 6, 1, 7, 3, 5]) {
      const before = read(db);
      db.transactions.playMove({ index });
      expect(read(db)).toEqual(State.playMove(before, { index }));
    }
  });

  it("playMove ignores an occupied cell, matching the spec", () => {
    const db = Database.create(ComputedDatabase.plugin);
    db.transactions.playMove({ index: 4 });
    const before = read(db);
    db.transactions.playMove({ index: 4 });
    expect(read(db)).toEqual(State.playMove(before, { index: 4 }));
  });

  it("restartGame matches State.restartGame after an X win", () => {
    const db = Database.create(ComputedDatabase.plugin);
    for (const i of [0, 3, 1, 4, 2]) db.transactions.playMove({ index: i });
    const before = read(db);
    db.transactions.restartGame();
    expect(read(db)).toEqual(State.restartGame(before));
  });
});
