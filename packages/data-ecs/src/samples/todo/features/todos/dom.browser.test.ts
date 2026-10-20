import { afterEach, describe, expect, it } from "vitest";
import { Entity, System, workers, type World } from "../../../../index.js";
import { createWorld } from "../../../../implementation/index.js";
import { settled, watchTicks } from "../../shared/ticks.test-helper.js";
import { dom, list, row, todoOf } from "./dom.js";
import { defineTodoList, type TodoList } from "./elements/todo-list.js";
import { defineTodoRow, type TodoRow } from "./elements/todo-row.js";
import { addTodo, deleteTodo, editTodo, moveTodo, toggleTodo } from "./model.js";
import { todosOf } from "./todos.test-helper.js";

defineTodoRow();
defineTodoList();

afterEach(() => {
    document.body.replaceChildren();
});

/** A world driving a list on the page through the todos feature's DOM systems. */
const createDriven = async (): Promise<{ readonly world: World; readonly element: TodoList }> => {
    const element = document.createElement("todo-list");
    document.body.append(element);
    const world = createWorld({ [workers]: 0, [list]: element });
    await watchTicks(world);
    for (const system of dom) world.add(system);
    return { world, element };
};

const rowsOf = (element: TodoList): TodoRow[] => [...element.querySelectorAll("todo-row")];

let rows = 0;
const countRows = System.create({ name: "test/countRows", observer: true, components: { has: [row] } }, () => {
    rows += 1;
});

/** How many todos have a row, placed or not. */
const rowCount = async (world: World): Promise<number> => {
    rows = 0;
    await world.run(countRows);
    return rows;
};

/** The element a mutation of `node` belongs to: the host of the shadow root it's in, or itself. */
const hostOf = (node: Node): Node => {
    const root = node.getRootNode();
    return root instanceof ShadowRoot ? root.host : node;
};

const shown = (element: TodoList): string[] => rowsOf(element).map(row => `${row.done ? "x" : "-"} ${row.label}`);

const todoAt = (element: TodoList, index: number): Entity => {
    const row = rowsOf(element)[index];
    const entity = row === undefined ? undefined : todoOf.get(row);
    if (entity === undefined) throw new Error(`No row ${index}.`);
    return entity;
};

/** The child list changes `run` makes to the list once its tick passed. */
const childChanges = async (element: TodoList, run: () => Promise<World.Report>): Promise<{ readonly added: number; readonly removed: number }> => {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver(delivered => records.push(...delivered));
    observer.observe(element, { childList: true });
    await settled(run());
    records.push(...observer.takeRecords());
    observer.disconnect();
    return { added: records.reduce((sum, record) => sum + record.addedNodes.length, 0), removed: records.reduce((sum, record) => sum + record.removedNodes.length, 0) };
};

describe("the todos feature's DOM systems", () => {
    it("give each todo a row, in list order, once the tick after it passed", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        await world.run(addTodo, { label: "milk" });
        await settled(world.run(addTodo, { label: "eggs" }));
        expect(shown(element)).toEqual(["- milk", "- eggs"]);
    });

    it("write only the rows whose todo changed", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        for (const text of ["a", "b", "c"]) await world.run(addTodo, { label: text });
        await settled(world.run(addTodo, { label: "d" }));
        const rows = rowsOf(element);
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(delivered => records.push(...delivered));
        for (const row of rows) {
            observer.observe(row, { attributes: true });
            if (row.shadowRoot !== null) observer.observe(row.shadowRoot, { subtree: true, childList: true, characterData: true, attributes: true });
        }
        await settled(world.run(toggleTodo, { entity: todoAt(element, 1) }));
        await settled(world.run(editTodo, { entity: todoAt(element, 2), label: "C" }));
        records.push(...observer.takeRecords());
        const changed = new Set(records.map(record => hostOf(record.target)));
        observer.disconnect();
        expect([...changed]).toEqual([rows[1], rows[2]]);
        expect(shown(element)).toEqual(["- a", "x b", "- C", "- d"]);
    });

    it("remove a deleted todo's row, leaving no node behind", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
        await settled(world.run(addTodo, { label: "c" }));
        const removed = rowsOf(element)[1];
        await settled(world.run(deleteTodo, { entity: todoAt(element, 1) }));
        expect(shown(element)).toEqual(["- a", "- c"]);
        expect(removed?.isConnected).toBe(false);
        await settled(world.run(editTodo, { entity: todoAt(element, 0), label: " " }));
        expect(shown(element)).toEqual(["- c"]);
        expect(element.children).toHaveLength(1);
    });

    it("move only the row whose todo moved", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        for (const text of ["a", "b", "c"]) await world.run(addTodo, { label: text });
        await settled(world.run(addTodo, { label: "d" }));
        expect(await childChanges(element, () => world.run(moveTodo, { entity: todoAt(element, 3), before: todoAt(element, 1) }))).toEqual({ added: 1, removed: 1 });
        expect(shown(element)).toEqual(["- a", "- d", "- b", "- c"]);
        expect(await childChanges(element, () => world.run(moveTodo, { entity: todoAt(element, 0), before: Entity.none }))).toEqual({ added: 1, removed: 1 });
        expect(shown(element)).toEqual(["- d", "- b", "- c", "- a"]);
        expect(await childChanges(element, () => world.run(moveTodo, { entity: todoAt(element, 3), before: todoAt(element, 0) }))).toEqual({ added: 1, removed: 1 });
        expect(shown(element)).toEqual(["- a", "- d", "- b", "- c"]);
    });

    it("keep a moved row focused, so it can be moved again by keyboard", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
        await settled(world.run(addTodo, { label: "c" }));
        const moved = rowsOf(element)[2];
        moved?.focus();
        expect(document.activeElement).toBe(moved);
        await settled(world.run(moveTodo, { entity: todoAt(element, 2), before: todoAt(element, 0) }));
        expect(shown(element)).toEqual(["- c", "- a", "- b"]);
        expect(document.activeElement).toBe(moved);
    });

    it("keep a moved row focused where the browser has no moveBefore", async () => {
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "moveBefore");
        Reflect.deleteProperty(Element.prototype, "moveBefore");
        try {
            const { world, element } = await createDriven();
            await using _ = world;
            for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
            await settled(world.run(addTodo, { label: "c" }));
            const moved = rowsOf(element)[2];
            moved?.focus();
            await settled(world.run(moveTodo, { entity: todoAt(element, 2), before: todoAt(element, 0) }));
            expect(shown(element)).toEqual(["- c", "- a", "- b"]);
            expect(document.activeElement).toBe(moved);
        }
        finally {
            if (descriptor !== undefined) Object.defineProperty(Element.prototype, "moveBefore", descriptor);
        }
    });

    it("make no rows while the page has no list", async () => {
        await using world = createWorld({ [workers]: 0 });
        await watchTicks(world);
        for (const system of dom) world.add(system);
        await settled(world.run(addTodo, { label: "a" }));
        expect(await rowCount(world)).toBe(0);
    });

    it("give no row to a todo deleted before the tick that would make it", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        await world.run(addTodo, { label: "a" });
        const [added] = await todosOf(world);
        await settled(world.run(deleteTodo, { entity: added?.entity ?? Entity.none }));
        expect(element.children).toHaveLength(0);
        expect(await rowCount(world)).toBe(0);
    });

    it("show what several runs before one tick changed", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        await world.run(addTodo, { label: "a" });
        const [added] = await todosOf(world);
        const entity = added?.entity ?? Entity.none;
        await world.run(toggleTodo, { entity });
        await settled(world.run(editTodo, { entity, label: "A" }));
        expect(shown(element)).toEqual(["x A"]);
    });

    it("place the rows of todos added together in list order", async () => {
        const { world, element } = await createDriven();
        await using _ = world;
        await world.run(addTodo, { label: "a" });
        await settled(world.run(addTodo, { label: "b" }));
        await world.run(moveTodo, { entity: todoAt(element, 1), before: todoAt(element, 0) });
        for (const text of ["c", "d"]) await world.run(addTodo, { label: text });
        await settled(world.run(addTodo, { label: "e" }));
        expect(shown(element)).toEqual(["- b", "- a", "- c", "- d", "- e"]);
    });

    it("remove every row when the world is disposed", async () => {
        const { world, element } = await createDriven();
        for (const text of ["a", "b"]) await world.run(addTodo, { label: text });
        await settled(world.run(addTodo, { label: "c" }));
        expect(element.children).toHaveLength(3);
        await world.dispose();
        expect(element.children).toHaveLength(0);
    });
});
