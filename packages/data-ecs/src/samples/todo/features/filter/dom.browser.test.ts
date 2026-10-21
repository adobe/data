import { afterEach, expect, it } from "vitest";
import { Entity, workers } from "../../../../index.js";
import { createWorld } from "../../../../implementation/index.js";
import { settled, watchTicks } from "../../shared/ticks.test-helper.js";
import * as todos from "../todos/dom.js";
import { TodoList } from "../todos/elements/todo-list.js";
import { TodoRow } from "../todos/elements/todo-row.js";
import { addTodo, toggleTodo } from "../todos/model.js";
import { dom, filters } from "./dom.js";
import { TodoFilters } from "./elements/todo-filters.js";
import { setFilter } from "./model.js";
import { define } from "../../shared/elements/define.js";

define({ "todo-list": TodoList, "todo-row": TodoRow, "todo-filters": TodoFilters });

afterEach(() => {
    document.body.replaceChildren();
});

it("shows the filter on its buttons, and hides the rows it leaves out, writing only those that change", async () => {
    const list = document.createElement("todo-list");
    const buttons = document.createElement("todo-filters");
    document.body.append(buttons, list);
    await using world = createWorld({ [workers]: 0, [todos.list]: list, [filters]: buttons });
    await watchTicks(world);
    for (const system of [todos.dom, dom]) world.add(system);
    for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
    await settled(world.run(addTodo, { label: "c" }));
    const rows = [...list.querySelectorAll("todo-row")];
    const entityAt = (index: number): Entity => {
        const element = rows[index];
        const entity = element === undefined ? undefined : todos.todoOf.get(element);
        if (entity === undefined) throw new Error(`No row ${index}.`);
        return entity;
    };
    await settled(world.run(toggleTodo, { entity: entityAt(1) }));
    const shown = (): string => rows.map(element => element.checkVisibility() ? element.label : "_").join("");
    expect(shown()).toBe("abc");

    const records: MutationRecord[] = [];
    const observer = new MutationObserver(delivered => records.push(...delivered));
    observer.observe(list, { attributes: true, attributeFilter: ["hidden"], subtree: true });
    const hiddenWrites = (): number => {
        records.push(...observer.takeRecords());
        return records.splice(0).length;
    };
    await settled(world.run(setFilter, { filter: "active" }));
    expect(buttons.filter).toBe("active");
    expect(shown()).toBe("a_c");
    expect(hiddenWrites()).toBe(1);
    await settled(world.run(setFilter, { filter: "completed" }));
    expect(shown()).toBe("_b_");
    expect(hiddenWrites()).toBe(3);
    // A todo that changes hides or shows as the filter has it.
    await settled(world.run(toggleTodo, { entity: entityAt(0) }));
    expect(shown()).toBe("ab_");
    expect(hiddenWrites()).toBe(1);
    await settled(world.run(addTodo, { label: "d" }));
    expect([...list.querySelectorAll("todo-row")].map(element => element.checkVisibility())).toEqual([true, true, false, false]);
    await settled(world.run(setFilter, { filter: "all" }));
    expect(shown()).toBe("abc");
    observer.disconnect();
});

it("moves focus off a row it hides, to the nearest row it shows", async () => {
    const list = document.createElement("todo-list");
    document.body.append(list);
    await using world = createWorld({ [workers]: 0, [todos.list]: list });
    await watchTicks(world);
    for (const system of [todos.dom, dom]) world.add(system);
    for (const text of ["a", "b", "c"]) await world.run(addTodo, { label: text });
    await settled(world.run(addTodo, { label: "d" }));
    const [a, b, c, d] = [...list.querySelectorAll("todo-row")];
    const entityOf = (element: Element | undefined): Entity => (element === undefined ? undefined : todos.todoOf.get(element)) ?? Entity.none;
    await world.run(toggleTodo, { entity: entityOf(b) });
    await settled(world.run(toggleTodo, { entity: entityOf(c) }));
    // Filtered out: b's nearest row shown is d, after c, which is hidden too.
    b?.focus();
    await settled(world.run(setFilter, { filter: "active" }));
    expect(document.activeElement).toBe(d);
    // Toggled out from under the filter: d has no row shown after it, so a gets the focus.
    await settled(world.run(toggleTodo, { entity: entityOf(d) }));
    expect(document.activeElement).toBe(a);
});
