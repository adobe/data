// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { AppSchema } from "./schema.js";

// Session-scoped columns are stripped on load, so no persistent archetype may pack
// one: a reloaded entity would fall out of it.
describe("app persistence", () => {
  it("reloaded todos (including dragged and assigned ones) stay in the Todo archetype", async () => {
    const saved = Database.create(AppSchema.plugin);
    saved.actions.createTodo({ name: "a" });
    saved.actions.createTodo({ name: "b" });
    saved.actions.reorderTodo({ id: saved.select(saved.archetypes.Todo.components)[0]!, toIndex: 1 });

    const loaded = Database.create(AppSchema.plugin);
    await loaded.fromData(saved.toData({ scope: { shared: true } }), { shared: true });
    expect(loaded.select(loaded.archetypes.Todo.components)).toHaveLength(2);
  });
});
