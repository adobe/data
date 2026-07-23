// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// gameOver is identity wiring to the already-tested data/ rule (State.isGameOver),
// so this only asserts the observable tracks the data/ verdict for the `lives`
// resource before and after transactions — it does not re-test the rule itself.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { Vec2 } from "@adobe/data/math";
import { State } from "../../../data/state/state.js";
import { ComputedDatabase } from "../computed-database.js";

const bounds: Vec2 = [800, 600];

describe("gameOver computed reflects data/ State.isGameOver over lives", () => {
  it("tracks the lives resource across transactions", () => {
    const db = Database.create(ComputedDatabase.plugin);
    db.transactions.setBounds(bounds);

    let value: boolean | undefined;
    const unsubscribe = db.computed.gameOver((v) => {
      value = v;
    });

    // Fresh game: three lives → not over, matching the data/ verdict.
    db.transactions.newGame();
    expect(value).toBe(State.isGameOver({ lives: db.resources.lives }));
    expect(value).toBe(false);

    // Spend every life → over.
    db.transactions.loseLife();
    db.transactions.loseLife();
    db.transactions.loseLife();
    expect(db.resources.lives).toBe(0);
    expect(value).toBe(State.isGameOver({ lives: db.resources.lives }));
    expect(value).toBe(true);

    unsubscribe();
  });
});
