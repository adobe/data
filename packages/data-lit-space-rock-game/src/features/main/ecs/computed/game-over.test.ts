// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// gameOver is identity wiring to the tested `Lives.isGameOver` rule, so this only
// asserts the observable tracks it for the `lives` resource across transactions.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { ComputedDatabase } from "./computed-database.js";

describe("gameOver computed reflects Lives.isGameOver over lives", () => {
  it("tracks the lives resource across transactions", () => {
    const db = Database.create(ComputedDatabase.plugin);

    let value: boolean | undefined;
    const unsubscribe = db.computed.gameOver((v) => {
      value = v;
    });

    db.transactions.createInitial({ bounds: [800, 600] });
    expect(value).toBe(false);

    db.transactions.loseLife();
    db.transactions.loseLife();
    expect(value).toBe(false);
    db.transactions.loseLife();
    expect(db.resources.lives).toBe(0);
    expect(value).toBe(true);

    unsubscribe();
  });
});
