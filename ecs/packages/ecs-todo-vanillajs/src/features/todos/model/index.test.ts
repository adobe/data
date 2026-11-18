// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "@adobe/ecs";
import { addTodo, deleteTodo, editTodo, moveTodo, toggleTodo } from "./index.js";
import { labelsOf, todoLabelled, todosOf, withTodos } from "../../../test/todos/model/index.js";

describe("todos", () => {
    it("adds todos at the end, trimmed, and ignores blank labels", async () => {
        await using world = await withTodos(" milk ", "eggs", "   ", "");
        expect(await todosOf(world)).toEqual([
            expect.objectContaining({ label: "milk", done: false }),
            expect.objectContaining({ label: "eggs", done: false }),
        ]);
    });

    it("toggles a todo", async () => {
        await using world = await withTodos("milk", "eggs");
        const milk = await todoLabelled(world, "milk");
        await world.run(toggleTodo, { entity: milk });
        expect((await todosOf(world)).map(item => item.done)).toEqual([true, false]);
        await world.run(toggleTodo, { entity: milk });
        expect((await todosOf(world)).map(item => item.done)).toEqual([false, false]);
    });

    it("edits a label, trimmed, and deletes a todo edited to blank", async () => {
        await using world = await withTodos("milk", "eggs");
        await world.run(editTodo, { entity: await todoLabelled(world, "milk"), label: " oat milk " });
        expect(await labelsOf(world)).toEqual(["oat milk", "eggs"]);
        await world.run(editTodo, { entity: await todoLabelled(world, "eggs"), label: "  " });
        expect(await labelsOf(world)).toEqual(["oat milk"]);
    });

    it("deletes a todo, and ignores entities that aren't todos", async () => {
        await using world = await withTodos("milk", "eggs");
        const milk = await todoLabelled(world, "milk");
        await world.run(deleteTodo, { entity: milk });
        expect(await labelsOf(world)).toEqual(["eggs"]);
        // A run that fails rejects: this one resolves.
        await world.run(deleteTodo, { entity: milk });
        await world.run(toggleTodo, { entity: milk });
        expect(await labelsOf(world)).toEqual(["eggs"]);
    });

    it("moves a todo before another, or to the end", async () => {
        await using world = await withTodos("a", "b", "c", "d");
        await world.run(moveTodo, { entity: await todoLabelled(world, "d"), before: await todoLabelled(world, "b") });
        expect(await labelsOf(world)).toEqual(["a", "d", "b", "c"]);
        await world.run(moveTodo, { entity: await todoLabelled(world, "a"), before: Entity.none });
        expect(await labelsOf(world)).toEqual(["d", "b", "c", "a"]);
        await world.run(moveTodo, { entity: await todoLabelled(world, "c"), before: await todoLabelled(world, "d") });
        expect(await labelsOf(world)).toEqual(["c", "d", "b", "a"]);
        // Moving before itself, or to where it already is, changes nothing.
        await world.run(moveTodo, { entity: await todoLabelled(world, "d"), before: await todoLabelled(world, "d") });
        await world.run(moveTodo, { entity: await todoLabelled(world, "d"), before: await todoLabelled(world, "b") });
        await world.run(moveTodo, { entity: await todoLabelled(world, "a"), before: Entity.none });
        expect(await labelsOf(world)).toEqual(["c", "d", "b", "a"]);
    });

    it("numbers todos again when no order lies between two neighbours", async () => {
        await using world = await withTodos("a", "b", "c");
        // Each move halves the gap before b, until no number is left in it.
        for (let i = 0; i < 60; i++) {
            const moving = i % 2 === 0 ? "c" : "a";
            await world.run(moveTodo, { entity: await todoLabelled(world, moving), before: await todoLabelled(world, "b") });
        }
        const todos = await todosOf(world);
        expect(todos.map(item => item.label)).toEqual(["c", "a", "b"]);
        expect(new Set(todos.map(item => item.order)).size).toBe(3);
    });

    it("adds after the last todo, wherever moves left it", async () => {
        await using world = await withTodos("a", "b");
        await world.run(moveTodo, { entity: await todoLabelled(world, "b"), before: await todoLabelled(world, "a") });
        await world.run(addTodo, { label: "c" });
        expect(await labelsOf(world)).toEqual(["b", "a", "c"]);
    });
});
