// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, expect, it } from "vitest";
import { Entity, workers, World } from "@adobe/ecs";
import { define, entityOfElement, root } from "../../../../../view/index.js";
import { settled, watchTicks } from "../../../../../test/ticks/model/index.js";
import * as todos from "../../../view/index.js";
import { TodoList, TodoRow } from "../../../elements/index.js";
import { addTodo, deleteTodo, editTodo, toggleTodo } from "../../../model/index.js";
import { TodoSummary, TodoToggleAll } from "../elements/index.js";
import { clearCompleted, toggleAll } from "../model/index.js";

define({ "todo-list": TodoList, "todo-row": TodoRow, "todo-summary": TodoSummary, "todo-toggle-all": TodoToggleAll });

afterEach(() => {
    document.body.replaceChildren();
});

it("shows the counts and whether all are done, and clears the rows of todos done", async () => {
    const list = document.createElement("todo-list");
    const count = document.createElement("todo-summary");
    const box = document.createElement("todo-toggle-all");
    document.body.append(box, list, count);
    await using world = World.create({ [workers]: 0, [root]: document.body });
    await watchTicks(world);
    for (const system of todos.todosView.systems) world.add(system);
    const state = (): string => `${count.remaining} left, ${count.completed} done, ${box.empty ? "empty" : box.checked ? "all done" : "some left"}, ${list.children.length} rows`;
    // The tick after the first run finds the elements.
    await settled(world.run(clearCompleted));
    expect(state()).toBe("0 left, 0 done, empty, 0 rows");

    for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
    await world.run(addTodo, { label: "c" });
    expect(state()).toBe("3 left, 0 done, some left, 3 rows");
    const entityAt = (index: number) => {
        const row = list.elementAt(index);
        const entity = entityOfElement(row ?? null);
        if (entity === Entity.none) throw new Error(`No row ${index}.`);
        return entity;
    };
    await world.run(toggleTodo, { entity: entityAt(0) });
    expect(state()).toBe("2 left, 1 done, some left, 3 rows");
    await world.run(toggleAll, { done: true });
    expect(state()).toBe("0 left, 3 done, all done, 3 rows");
    await world.run(toggleTodo, { entity: entityAt(1) });
    await world.run(editTodo, { entity: entityAt(1), label: "B" });
    expect(state()).toBe("1 left, 2 done, some left, 3 rows");
    await world.run(clearCompleted);
    expect(state()).toBe("1 left, 0 done, some left, 1 rows");
    await world.run(deleteTodo, { entity: entityAt(0) });
    expect(state()).toBe("0 left, 0 done, empty, 0 rows");
});
