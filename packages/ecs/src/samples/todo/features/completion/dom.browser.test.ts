import { afterEach, expect, it } from "vitest";
import { Entity, workers, World } from "../../../../index.js";
import { entityOfElement } from "../../shared/attach.js";
import { settled, watchTicks } from "../../shared/ticks.test-helper.js";
import * as todos from "../todos/dom.js";
import { TodoList } from "../todos/elements/todo-list.js";
import { TodoRow } from "../todos/elements/todo-row.js";
import { addTodo, deleteTodo, editTodo, toggleTodo } from "../todos/model.js";
import { dom, summary, toggleAllBox } from "./dom.js";
import { TodoSummary } from "./elements/todo-summary.js";
import { TodoToggleAll } from "./elements/todo-toggle-all.js";
import { clearCompleted, toggleAll } from "./model.js";
import { define } from "../../shared/elements/define.js";

define({ "todo-list": TodoList, "todo-row": TodoRow, "todo-summary": TodoSummary, "todo-toggle-all": TodoToggleAll });

afterEach(() => {
    document.body.replaceChildren();
});

it("shows the counts and whether all are done, and clears the rows of todos done", async () => {
    const list = document.createElement("todo-list");
    const count = document.createElement("todo-summary");
    const box = document.createElement("todo-toggle-all");
    document.body.append(box, list, count);
    await using world = World.create({ [workers]: 0, [todos.list]: list, [summary]: count, [toggleAllBox]: box });
    await watchTicks(world);
    for (const system of [todos.dom, dom]) world.add(system);
    const state = (): string => `${count.remaining} left, ${count.completed} done, ${box.empty ? "empty" : box.checked ? "all done" : "some left"}, ${list.children.length} rows`;
    await settled(world.run(clearCompleted));
    expect(state()).toBe("0 left, 0 done, empty, 0 rows");

    for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
    await settled(world.run(addTodo, { label: "c" }));
    expect(state()).toBe("3 left, 0 done, some left, 3 rows");
    const entityAt = (index: number) => {
        const row = list.children[index];
        const entity = entityOfElement(row ?? null);
        if (entity === Entity.none) throw new Error(`No row ${index}.`);
        return entity;
    };
    await settled(world.run(toggleTodo, { entity: entityAt(0) }));
    expect(state()).toBe("2 left, 1 done, some left, 3 rows");
    await settled(world.run(toggleAll, { done: true }));
    expect(state()).toBe("0 left, 3 done, all done, 3 rows");
    await settled(world.run(toggleTodo, { entity: entityAt(1) }));
    await settled(world.run(editTodo, { entity: entityAt(1), label: "B" }));
    expect(state()).toBe("1 left, 2 done, some left, 3 rows");
    await settled(world.run(clearCompleted));
    expect(state()).toBe("1 left, 0 done, some left, 1 rows");
    await settled(world.run(deleteTodo, { entity: entityAt(0) }));
    expect(state()).toBe("0 left, 0 done, empty, 0 rows");
});
