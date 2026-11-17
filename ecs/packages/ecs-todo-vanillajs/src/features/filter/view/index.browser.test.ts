// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, expect, it } from "vitest";
import { Entity, workers, World } from "@adobe/ecs";
import { define, entityOfElement } from "../../page/view/index.js";
import { settled, watchTicks } from "../../page/view/ticks.test-helper.js";
import * as todos from "../../todos/view/index.js";
import { TodoList, TodoRow } from "../../todos/elements/index.js";
import { addTodo, toggleTodo } from "../../todos/model/index.js";
import { systems } from "./index.js";
import { filters } from "./shared/resource.filters.js";
import { TodoFilters } from "../elements/index.js";
import { setFilter } from "../model/index.js";

define({ "todo-list": TodoList, "todo-row": TodoRow, "todo-filters": TodoFilters });

afterEach(() => {
    document.body.replaceChildren();
});

/** A world driving a list, and the filter's buttons when given, holding todos a to d. */
const createDriven = async (buttons: TodoFilters | null = null): Promise<{ readonly world: World; readonly list: TodoList }> => {
    const list = document.createElement("todo-list");
    if (buttons !== null) document.body.append(buttons);
    document.body.append(list);
    const world = World.create({ [workers]: 0, [todos.list]: list, ...(buttons === null ? {} : { [filters]: buttons }) });
    await watchTicks(world);
    for (const system of [...todos.systems, ...systems]) world.add(system);
    for (const text of ["a", "b", "c"]) await world.run(addTodo, { label: text });
    await settled(world.run(addTodo, { label: "d" }));
    return { world, list };
};

/** The labels the list shows, in order, `x` before those done. */
const shown = (list: TodoList): string => [...list.querySelectorAll("todo-row")]
    .sort((a, b) => list.indexOf(a) - list.indexOf(b))
    .map(row => `${row.done ? "x" : ""}${row.label}`)
    .join(" ");

const entityAt = (list: TodoList, index: number): Entity => {
    const entity = entityOfElement(list.elementAt(index));
    if (entity === Entity.none) throw new Error(`No row ${index}.`);
    return entity;
};

it("shows the filter on its buttons, and only the todos it keeps in the list", async () => {
    const buttons = document.createElement("todo-filters");
    const { world, list } = await createDriven(buttons);
    await using _ = world;
    await settled(world.run(toggleTodo, { entity: entityAt(list, 1) }));
    expect(shown(list)).toBe("a xb c d");
    await settled(world.run(setFilter, { filter: "active" }));
    expect(buttons.filter).toBe("active");
    expect(shown(list)).toBe("a c d");
    await settled(world.run(setFilter, { filter: "completed" }));
    expect(shown(list)).toBe("xb");
    expect(list.count).toBe(1);
    // A todo that changes leaves or enters the list as the filter has it.
    await settled(world.run(toggleTodo, { entity: entityAt(list, 0) }));
    expect(shown(list)).toBe("");
    await settled(world.run(setFilter, { filter: "active" }));
    expect(shown(list)).toBe("a b c d");
    await settled(world.run(setFilter, { filter: "all" }));
    expect(shown(list)).toBe("a b c d");
});

it("moves focus off a row whose todo it leaves out, to the row at its place", async () => {
    const { world, list } = await createDriven();
    await using _ = world;
    const [a, b, c, d] = [0, 1, 2, 3].map(index => list.elementAt(index));
    await world.run(toggleTodo, { entity: entityOfElement(b ?? null) });
    await settled(world.run(toggleTodo, { entity: entityOfElement(c ?? null) }));
    // Filtered out: b's place is d's, after c, which is left out too.
    b?.focus();
    await settled(world.run(setFilter, { filter: "active" }));
    expect(document.activeElement).toBe(d);
    // Toggled out from under the filter: d has no row after it, so a, before it, gets the focus.
    await settled(world.run(toggleTodo, { entity: entityOfElement(d ?? null) }));
    expect(document.activeElement).toBe(a);
});
