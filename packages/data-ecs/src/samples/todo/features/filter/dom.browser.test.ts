import { afterEach, expect, it } from "vitest";
import { workers } from "../../../../index.js";
import { createWorld } from "../../../../implementation/index.js";
import { settled, watchTicks } from "../../shared/ticks.test-helper.js";
import * as todos from "../todos/dom.js";
import { defineTodoList } from "../todos/elements/todo-list.js";
import { defineTodoRow } from "../todos/elements/todo-row.js";
import { addTodo, toggleTodo } from "../todos/model.js";
import { dom, filters } from "./dom.js";
import { defineTodoFilters } from "./elements/todo-filters.js";
import { setFilter } from "./model.js";

defineTodoRow();
defineTodoList();
defineTodoFilters();

afterEach(() => {
    document.body.replaceChildren();
});

it("shows the filter on the buttons and filters the list's rows, with one write to each per change", async () => {
    const list = document.createElement("todo-list");
    const buttons = document.createElement("todo-filters");
    document.body.append(buttons, list);
    await using world = createWorld({ [workers]: 0, [todos.list]: list, [filters]: buttons });
    await watchTicks(world);
    for (const system of [...todos.dom, ...dom]) world.add(system);
    await world.run(addTodo, { label: "a" });
    await settled(world.run(addTodo, { label: "b" }));
    const [first, second] = list.querySelectorAll("todo-row");
    const entity = first === undefined ? undefined : todos.todoOf.get(first);
    if (entity === undefined || second === undefined) throw new Error("No rows.");
    await settled(world.run(toggleTodo, { entity }));
    const shown = (): boolean[] => [first?.checkVisibility() ?? false, second.checkVisibility()];
    expect(shown()).toEqual([true, true]);

    const records: MutationRecord[] = [];
    const observer = new MutationObserver(delivered => records.push(...delivered));
    observer.observe(list, { attributes: true, childList: true, subtree: true });
    await settled(world.run(setFilter, { filter: "active" }));
    expect(buttons.filter).toBe("active");
    expect(shown()).toEqual([false, true]);
    await settled(world.run(setFilter, { filter: "completed" }));
    expect(shown()).toEqual([true, false]);
    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records.map(record => `${record.type} ${record.attributeName}`)).toEqual(["attributes filter", "attributes filter"]);
});
