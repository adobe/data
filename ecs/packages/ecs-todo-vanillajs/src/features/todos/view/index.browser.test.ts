// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it } from "vitest";
import { Entity, System, workers, World } from "@adobe/ecs";
import { define, entityOfElement } from "../../page/view/index.js";
import { list, onlyDone, renderRows, systems } from "./index.js";
import { TodoList, TodoRow } from "../elements/index.js";
import { addTodo, deleteTodo, done, editTodo, label, moveTodo, order, Todo, toggleTodo } from "../model/index.js";
import { todosOf } from "../model/todos.test-helper.js";

define({ "todo-list": TodoList, "todo-row": TodoRow });

afterEach(() => {
    document.body.replaceChildren();
});

/** A world driving a list on the page, `height` tall, through the todos feature's DOM systems, which run after each run. */
const createDriven = async (height = ""): Promise<{ readonly world: World; readonly element: TodoList }> => {
    const element = document.createElement("todo-list");
    element.style.height = height;
    document.body.append(element);
    const world = World.create({ [workers]: 0, [list]: element });
    for (const system of systems) world.add(system);
    return { world, element };
};

/** The list's rows, in the order of the todos they show. */
const rowsOf = (element: TodoList): TodoRow[] => [...element.querySelectorAll("todo-row")].sort((a, b) => element.indexOf(a) - element.indexOf(b));

const shown = (element: TodoList): string[] => rowsOf(element).map(row => `${row.done ? "x" : "-"} ${row.label}`);

const todoAt = (element: TodoList, index: number): Entity => {
    const entity = entityOfElement(element.elementAt(index));
    if (entity === Entity.none) throw new Error(`No row ${index}.`);
    return entity;
};

/** Adds `count` todos labelled by their place, `t0` on, done every other one when `alternate`. */
const addMany = System.create({}, ({ commands }, input: { readonly count: number; readonly alternate: boolean }) => {
    const spawn = commands.spawn(Todo);
    for (let i = 0; i < input.count; i++) spawn({ [label]: `t${i}`, [done]: input.alternate && i % 2 === 1, [order]: i });
});

const show = System.create({}, ({ resources }, input: { readonly only: boolean | null }) => {
    resources[onlyDone] = input.only;
});

/** The mutations `run` makes to the list and its rows, by what they changed. */
const changesOf = async (element: TodoList, run: () => Promise<unknown>): Promise<{ readonly childList: number; readonly moved: readonly Element[] }> => {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver(delivered => records.push(...delivered));
    observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    await run();
    records.push(...observer.takeRecords());
    observer.disconnect();
    return {
        childList: records.filter(record => record.type === "childList").length,
        moved: records.filter(record => record.type === "attributes").map(record => record.target).filter(target => target instanceof Element),
    };
};

describe("the todos feature's DOM systems", () => {
    it("give each todo a row, in list order, once its run passed", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        await world.run(addTodo, { label: "milk" });
        await world.run(addTodo, { label: "eggs" });
        expect(shown(element)).toEqual(["- milk", "- eggs"]);
        expect(element.count).toBe(2);
    });

    it("write only the rows whose todo changed", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        for (const text of ["a", "b", "c"]) await world.run(addTodo, { label: text });
        await world.run(addTodo, { label: "d" });
        const rows = rowsOf(element);
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(delivered => records.push(...delivered));
        for (const row of rows) {
            observer.observe(row, { attributes: true });
            if (row.shadowRoot !== null) observer.observe(row.shadowRoot, { subtree: true, childList: true, characterData: true, attributes: true });
        }
        await world.run(toggleTodo, { entity: todoAt(element, 1) });
        await world.run(editTodo, { entity: todoAt(element, 2), label: "C" });
        records.push(...observer.takeRecords());
        const changed = new Set(records.map(record => {
            const root = record.target.getRootNode();
            return root instanceof ShadowRoot ? root.host : record.target;
        }));
        observer.disconnect();
        expect([...changed]).toEqual([rows[1], rows[2]]);
        expect(shown(element)).toEqual(["- a", "x b", "- C", "- d"]);
    });

    it("remove a deleted todo's row, moving those after it up", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
        await world.run(addTodo, { label: "c" });
        const [a, removed, c] = rowsOf(element);
        await world.run(deleteTodo, { entity: todoAt(element, 1) });
        expect(shown(element)).toEqual(["- a", "- c"]);
        expect(removed?.isConnected).toBe(false);
        expect(rowsOf(element)).toEqual([a, c]);
        await world.run(editTodo, { entity: todoAt(element, 0), label: " " });
        expect(shown(element)).toEqual(["- c"]);
        expect(element.children).toHaveLength(1);
    });

    it("move a todo by moving the rows whose place changed, never in the DOM", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        for (const text of ["a", "b", "c"]) await world.run(addTodo, { label: text });
        await world.run(addTodo, { label: "d" });
        const [a, b, c, d] = rowsOf(element);
        expect(await changesOf(element, () => world.run(moveTodo, { entity: todoAt(element, 3), before: todoAt(element, 1) }))).toEqual({ childList: 0, moved: [d, b, c] });
        expect(shown(element)).toEqual(["- a", "- d", "- b", "- c"]);
        expect(rowsOf(element)).toEqual([a, d, b, c]);
        expect(await changesOf(element, () => world.run(moveTodo, { entity: todoAt(element, 0), before: Entity.none }))).toEqual({ childList: 0, moved: [d, b, c, a] });
        expect(shown(element)).toEqual(["- d", "- b", "- c", "- a"]);
    });

    it("keep a moved row focused, so it can be moved again by keyboard", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
        await world.run(addTodo, { label: "c" });
        const moved = rowsOf(element)[2];
        moved?.focus();
        expect(document.activeElement).toBe(moved);
        await world.run(moveTodo, { entity: todoAt(element, 2), before: todoAt(element, 0) });
        expect(shown(element)).toEqual(["- c", "- a", "- b"]);
        expect(document.activeElement).toBe(moved);
    });

    it("make no rows while the page has no list", async () => {
        await using world = World.create({ [workers]: 0 });
            for (const system of systems) world.add(system);
        await world.run(addTodo, { label: "a" });
        expect(document.querySelectorAll("todo-row")).toHaveLength(0);
    });

    it("show what several runs before one tick changed", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        await world.run(addTodo, { label: "a" });
        const [added] = await todosOf(world);
        const entity = added?.entity ?? Entity.none;
        await world.run(toggleTodo, { entity });
        await world.run(editTodo, { entity, label: "A" });
        expect(shown(element)).toEqual(["x A"]);
    });

    it("place the rows of todos added together in list order", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        await world.run(addTodo, { label: "a" });
        await world.run(addTodo, { label: "b" });
        await world.run(moveTodo, { entity: todoAt(element, 1), before: todoAt(element, 0) });
        for (const text of ["c", "d"]) await world.run(addTodo, { label: text });
        await world.run(addTodo, { label: "e" });
        expect(shown(element)).toEqual(["- b", "- a", "- c", "- d", "- e"]);
    });

    it("render only the range of many todos the list needs, as far as they reach", async () => {
        const { world, element } = await createDriven("220px");
        await using _ = world;
        await world.run(addMany, { count: 1000, alternate: false });
        const { start, end } = element.range;
        expect(start).toBe(0);
        expect(element.count).toBe(1000);
        expect(shown(element)).toEqual(Array.from({ length: end }, (_, i) => `- t${i}`));
        expect(element.scrollHeight).toBe(44000);
    });

    it("render a new range as the list scrolls, rebinding only the rows it reuses", async () => {
        const { world, element } = await createDriven("220px");
        await using _ = world;
        await world.run(addMany, { count: 1000, alternate: false });
        const rows = new Set(rowsOf(element));
        const scrolled = new Promise(resolve => element.addEventListener("virtual-range", resolve, { once: true }));
        element.scrollTop = 4400;
        await scrolled;
        const { start, end } = element.range;
        expect(start).toBeGreaterThan(0);
        await world.run(renderRows);
        expect(shown(element)).toEqual(Array.from({ length: end - start }, (_, i) => `- t${start + i}`));
        // The scroll passed every row, so each was reused, and the range, now with rows above the view too, made more.
        expect([...rows].filter(row => !row.isConnected)).toEqual([]);
        expect(rowsOf(element)).toHaveLength(end - start);
        expect(rowsOf(element).map(row => entityOfElement(row))).toEqual((await todosOf(world)).slice(start, end).map(todo => todo.entity));
    });

    it("show only the todos onlyDone keeps, and focus the nearest row when the focused one's todo goes", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        await world.run(addMany, { count: 6, alternate: true });
        rowsOf(element)[2]?.focus();
        await world.run(show, { only: false });
        expect(shown(element)).toEqual(["- t0", "- t2", "- t4"]);
        expect(document.activeElement).toBe(element.elementAt(1));
        await world.run(show, { only: true });
        expect(shown(element)).toEqual(["x t1", "x t3", "x t5"]);
        await world.run(show, { only: null });
        expect(element.count).toBe(6);
        expect(shown(element)).toHaveLength(6);
    });

    it("keep the focused row while its todo scrolls out of the range, where its todo is", async () => {
        const { world, element } = await createDriven("220px");
        await using _ = world;
        await world.run(addMany, { count: 1000, alternate: false });
        const focused = rowsOf(element)[1];
        focused?.focus();
        const scrolled = new Promise(resolve => element.addEventListener("virtual-range", resolve, { once: true }));
        element.scrollTop = 22000;
        await scrolled;
        await world.run(renderRows);
        expect(document.activeElement).toBe(focused);
        expect(focused?.label).toBe("t1");
        expect(element.indexOf(focused ?? element)).toBe(1);
        await world.run(moveTodo, { entity: entityOfElement(focused ?? null), before: Entity.none });
        expect(element.indexOf(focused ?? element)).toBe(999);
    });
});
