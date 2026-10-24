// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System } from "../../../../index.js";
import { toggleTodo } from "../todos/model.js";
import { entityOf, todosOf, withTodos } from "../todos/todos.test-helper.js";
import { done } from "../todos/data.js";
import { clearCompleted, toggleAll } from "./model.js";

let writes = 0;
/** Counts the todos written since it last ran. */
const countWrites = System.create({ observer: true, components: { with: [done], changed: [done] } }, () => {
    writes += 1;
});

describe("completion", () => {
    it("marks every todo done, or none, writing only those that change", async () => {
        await using world = await withTodos("a", "b", "c");
        await world.run(toggleTodo, { entity: await entityOf(world, "b") });
        await world.run(countWrites);
        writes = 0;
        await world.run(toggleAll, { done: true });
        expect((await todosOf(world)).map(item => item.done)).toEqual([true, true, true]);
        await world.run(countWrites);
        expect(writes).toBe(2);
        writes = 0;
        await world.run(toggleAll, { done: false });
        expect((await todosOf(world)).map(item => item.done)).toEqual([false, false, false]);
        await world.run(countWrites);
        expect(writes).toBe(3);
    });

    it("clears the todos that are done", async () => {
        await using world = await withTodos("a", "b", "c");
        await world.run(toggleTodo, { entity: await entityOf(world, "a") });
        await world.run(toggleTodo, { entity: await entityOf(world, "c") });
        await world.run(clearCompleted);
        expect((await todosOf(world)).map(item => item.label)).toEqual(["b"]);
        await world.run(clearCompleted);
        expect((await todosOf(world)).map(item => item.label)).toEqual(["b"]);
    });
});
