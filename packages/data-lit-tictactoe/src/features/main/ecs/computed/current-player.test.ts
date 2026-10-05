// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { PlayerMark } from "../../data/values/player-mark/player-mark.js";
import { ComputedDatabase } from "./computed-database.js";

describe("currentPlayer", () => {
  it("re-emits when a restart flips firstPlayer on an empty board", async () => {
    const db = Database.create(ComputedDatabase.plugin);
    const seen: PlayerMark[] = [];
    const unobserve = db.computed.currentPlayer((player) => seen.push(player));
    await vi.waitFor(() => expect(seen[seen.length - 1]).toBe("X"));

    db.transactions.restartGame();
    await vi.waitFor(() => expect(seen[seen.length - 1]).toBe("O"));
    unobserve();
  });
});
