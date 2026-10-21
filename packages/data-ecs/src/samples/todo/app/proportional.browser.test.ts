import { afterEach, expect, it } from "vitest";
import { Entity, type World } from "../../../index.js";
import { toggleAll } from "../features/completion/model.js";
import { setFilter } from "../features/filter/model.js";
import { addGenerated } from "../features/generate/model.js";
import { todoOf } from "../features/todos/dom.js";
import { TodoRow } from "../features/todos/elements/todo-row.js";
import { addTodo, deleteTodo, editTodo, moveTodo, toggleTodo } from "../features/todos/model.js";
import { nextTick, watchTicks } from "../shared/ticks.test-helper.js";
import { createApp } from "./app.js";

/**
 * Each operation's work follows what it changed, whatever the list holds: both the DOM's mutations and how often the
 * DOM systems reach rows, since elements drop equal writes and systems skip rows already right, which would hide a
 * system that visits every row. `app/todo.perf-browser-test.ts` times them.
 */

const markup = `<todo-toggle-all></todo-toggle-all><todo-list></todo-list><todo-summary></todo-summary><todo-filters></todo-filters>`;

afterEach(() => {
    document.body.replaceChildren();
});

/** How often the DOM systems reached rows: the row properties they write, `hidden`, and what placing reads and calls. */
let reaches = 0;

/** Counts calls of an accessor's `kind` on `target`, until the returned function puts it back. */
const countAccessor = (target: object, name: string, kind: "get" | "set"): (() => void) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    const original = descriptor?.[kind];
    if (descriptor === undefined || original === undefined) throw new Error(`No ${kind} ${name}.`);
    Object.defineProperty(target, name, {
        ...descriptor,
        [kind]: function (this: unknown, ...values: unknown[]): unknown {
            reaches += 1;
            return Reflect.apply(original, this, values);
        },
    });
    return () => Object.defineProperty(target, name, descriptor);
};

/** Counts calls of a method on `target`, until the returned function puts it back. */
const countMethod = (target: object, name: string): (() => void) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    const original: unknown = descriptor?.value;
    if (descriptor === undefined || typeof original !== "function") throw new Error(`No method ${name}.`);
    Object.defineProperty(target, name, {
        ...descriptor,
        value: function (this: unknown, ...values: unknown[]): unknown {
            reaches += 1;
            return Reflect.apply(original, this, values);
        },
    });
    return () => Object.defineProperty(target, name, descriptor);
};

const countReaches = (): (() => void) => {
    const restores = [
        countAccessor(TodoRow.prototype, "label", "set"),
        countAccessor(TodoRow.prototype, "done", "set"),
        countAccessor(HTMLElement.prototype, "hidden", "get"),
        countAccessor(HTMLElement.prototype, "hidden", "set"),
        countAccessor(Element.prototype, "nextElementSibling", "get"),
        countAccessor(Element.prototype, "firstElementChild", "get"),
        countMethod(Element.prototype, "moveBefore"),
        countMethod(Node.prototype, "insertBefore"),
    ];
    return () => {
        for (const restore of restores) restore();
    };
};

type Work = { readonly mutations: number; readonly reaches: number };

/** The mutations of the page and its open shadow roots, and the rows reached, from `change` until the tick after it. */
const workOf = async (change: () => Promise<number>): Promise<Work> => {
    let mutations = 0;
    const observer = new MutationObserver(records => {
        mutations += records.length;
    });
    const options = { attributes: true, childList: true, characterData: true, subtree: true };
    observer.observe(document.body, options);
    for (const element of document.body.querySelectorAll("*")) if (element.shadowRoot !== null) observer.observe(element.shadowRoot, options);
    reaches = 0;
    await change();
    await nextTick();
    mutations += observer.takeRecords().length;
    observer.disconnect();
    return { mutations, reaches };
};

/** Work less `rows` mutations and `perRow` reaches for each of them. */
const beyond = (work: Work, rows: number, perRow: number): Work => ({ mutations: work.mutations - rows, reaches: work.reaches - perRow * rows });

/** Each operation's work, on an app holding `n` todos, every other one done. */
const workWith = async (n: number): Promise<Record<string, Work>> => {
    document.body.innerHTML = markup;
    const app = createApp(document.body);
    await watchTicks(app.world);
    const { world } = app;
    await world.run(addGenerated, { count: n });
    await nextTick();
    const listed = [...document.querySelectorAll("todo-row")].map(row => todoOf.get(row) ?? Entity.none);
    const at = (index: number): Entity => listed[(index + n) % n] ?? Entity.none;
    for (let i = 0; i < n; i += 2) await world.run(toggleTodo, { entity: at(i) });
    await nextTick();
    const rows = (): HTMLElementTagNameMap["todo-row"][] => [...document.querySelectorAll("todo-row")];
    const work: Record<string, Work> = {
        "toggle one": await workOf(() => world.run(toggleTodo, { entity: at(1) })),
        "edit one": await workOf(() => world.run(editTodo, { entity: at(3), label: "edited" })),
        "move one": await workOf(() => world.run(moveTodo, { entity: at(-1), before: at(0) })),
        "add one": await workOf(() => world.run(addTodo, { label: "added" })),
        "delete one": await workOf(() => world.run(deleteTodo, { entity: at(5) })),
    };
    // A new filter passes every row, reading whether it's hidden, and writes those that change.
    const filtered = await workOf(() => world.run(setFilter, { filter: "active" }));
    const hidden = rows().filter(row => row.hidden).length;
    work["filter, beyond each row read and each hidden"] = beyond({ mutations: filtered.mutations, reaches: filtered.reaches - rows().length }, hidden, 1);
    await world.run(setFilter, { filter: "all" });
    await nextTick();
    // Each row marked done gets its label and done written and its visibility read.
    const notDone = rows().filter(row => !row.done).length;
    work["toggle all, beyond each row marked done"] = beyond(await workOf(() => world.run(toggleAll, { done: true })), notDone, 3);
    await app.dispose();
    return work;
};

it("does work in proportion to what changed, not to how many todos there are", async () => {
    const restore = countReaches();
    try {
        const small = await workWith(100);
        const large = await workWith(2000);
        expect(large).toEqual(small);
        expect(small).toEqual({
            // The row's done attribute, and the summary's count; its label, done and visibility, and the summary's
            // clear button, shown.
            "toggle one": { mutations: 2, reaches: 4 },
            // The row's label; its label and done.
            "edit one": { mutations: 1, reaches: 2 },
            // The row out of the list and in again; where it is, and the move.
            "move one": { mutations: 2, reaches: 2 },
            // The new row into the list, the tabindex and draggable it sets once connected, and the summary's count,
            // its label being written in a shadow root made after the count began; its label, done, visibility, and
            // where it goes, and its placing.
            "add one": { mutations: 4, reaches: 5 },
            // The row out of the list, and the summary's count.
            "delete one": { mutations: 2, reaches: 0 },
            // The filter buttons pressed and released.
            "filter, beyond each row read and each hidden": { mutations: 2, reaches: 0 },
            // The summary's count; its clear button.
            "toggle all, beyond each row marked done": { mutations: 1, reaches: 1 },
        });
    }
    finally {
        restore();
    }
});
