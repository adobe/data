// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Entity, System } from "@adobe/ecs";
import { toggleAll } from "../features/completion/model/index.js";
import { setFilter } from "../features/filter/model/index.js";
import { addGenerated } from "../features/generate/model/index.js";
import { TodoRow } from "../features/todos/elements/index.js";
import { addTodo, deleteTodo, editTodo, moveTodo, todo, toggleTodo } from "../features/todos/model/index.js";
import { row } from "../features/todos/view/index.js";
import { entityOfElement } from "../features/page/view/index.js";
import { part } from "../features/page/view/elements.test-helper.js";
import { nextTick, watchTicks } from "../features/page/view/ticks.test-helper.js";
import { createApp } from "./function.create-app.js";
import type { App } from "./type.app.js";

/** The page's markup, as index.html has it. */
const markup = `
<header><todo-toggle-all></todo-toggle-all><todo-entry></todo-entry></header>
<todo-list></todo-list>
<footer><todo-summary></todo-summary><todo-filters></todo-filters></footer>
<todo-generate></todo-generate>`;

const found = <K extends keyof HTMLElementTagNameMap>(name: K): HTMLElementTagNameMap[K] => {
    const element = document.querySelector(name);
    if (element === null) throw new Error(`No ${name}.`);
    return element;
};

describe("on the page's markup", () => {
    let app: App;
    let errors: unknown[];
    const logged = console.error;

    beforeEach(async () => {
        errors = [];
        console.error = (...values: unknown[]) => errors.push(values);
        document.body.innerHTML = markup;
        app = createApp(document.body);
        await watchTicks(app.world);
    });

    afterEach(async () => {
        await app.dispose();
        console.error = logged;
        document.body.replaceChildren();
        expect(errors).toEqual([]);
    });

    const rows = (): HTMLElementTagNameMap["todo-row"][] => [...found("todo-list").querySelectorAll("todo-row")];
    /** What a user sees in the list: each shown row, `x` when done. */
    const shown = (): string[] => rows().filter(row => row.checkVisibility()).map(row => `${row.done ? "x" : "-"} ${row.label}`);
    const left = (): string => part(found("todo-summary"), ".count", HTMLElement).textContent ?? "";

    /** Types `text` into the entry and presses Enter. */
    const enter = (text: string): void => {
        const input = part(found("todo-entry"), "input", HTMLInputElement);
        input.value = text;
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    };

    /** Enters a todo, and waits for the tick that shows it. */
    const type = async (text: string): Promise<void> => {
        enter(text);
        await nextTick();
    };

    const rowPart = <E extends Element>(index: number, selector: string, kind: abstract new () => E): E => {
        const row = rows()[index];
        if (row === undefined) throw new Error(`No row ${index}.`);
        return part(row, selector, kind);
    };

    describe("the todo app", () => {
        it("adds, toggles, edits and deletes todos as a user does", async () => {
            // A blank entry dispatches nothing.
            enter("   ");
            await type("Buy milk");
            await type("Walk the dog");
            expect(shown()).toEqual(["- Buy milk", "- Walk the dog"]);
            expect(left()).toBe("2 items left");

            rowPart(1, ".toggle", HTMLInputElement).click();
            await nextTick();
            expect(shown()).toEqual(["- Buy milk", "x Walk the dog"]);
            expect(left()).toBe("1 item left");

            rowPart(0, ".label", HTMLElement).dispatchEvent(new MouseEvent("dblclick"));
            const edit = rowPart(0, ".edit", HTMLInputElement);
            edit.value = "Buy oat milk";
            edit.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
            await nextTick();
            expect(shown()).toEqual(["- Buy oat milk", "x Walk the dog"]);

            rowPart(0, ".delete", HTMLButtonElement).click();
            await nextTick();
            expect(shown()).toEqual(["x Walk the dog"]);
            expect(rows()).toHaveLength(1);
        });

        it("filters, toggles all and clears completed", async () => {
            for (const text of ["a", "b", "c"]) await type(text);
            rowPart(1, ".toggle", HTMLInputElement).click();
            await nextTick();
            const filter = (name: string): void => part(found("todo-filters"), `[data-filter=${name}]`, HTMLButtonElement).click();
            filter("active");
            await nextTick();
            expect(shown()).toEqual(["- a", "- c"]);
            filter("completed");
            await nextTick();
            expect(shown()).toEqual(["x b"]);
            filter("all");
            await nextTick();

            part(found("todo-toggle-all"), "input", HTMLInputElement).click();
            await nextTick();
            expect(shown()).toEqual(["x a", "x b", "x c"]);
            expect(found("todo-toggle-all").checked).toBe(true);
            part(found("todo-toggle-all"), "input", HTMLInputElement).click();
            await nextTick();
            expect(shown()).toEqual(["- a", "- b", "- c"]);

            rowPart(0, ".toggle", HTMLInputElement).click();
            rowPart(2, ".toggle", HTMLInputElement).click();
            await nextTick();
            part(found("todo-summary"), ".clear", HTMLButtonElement).click();
            await nextTick();
            expect(shown()).toEqual(["- b"]);
            expect(rows()).toHaveLength(1);
        });

        it("moves todos with the keyboard and by dragging", async () => {
            for (const text of ["a", "b", "c"]) await type(text);
            rows()[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }));
            await nextTick();
            expect(shown()).toEqual(["- a", "- c", "- b"]);
            const [a, , b] = rows();
            if (a === undefined || b === undefined) throw new Error("No rows.");
            const dataTransfer = new DataTransfer();
            a.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer }));
            const bounds = b.getBoundingClientRect();
            b.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, composed: true, dataTransfer, clientY: bounds.bottom - 1 }));
            await nextTick();
            expect(shown()).toEqual(["- c", "- b", "- a"]);
        });

        it("generates todos and clears them all, leaving no rows", async () => {
            part(found("todo-generate"), "[data-count='1000']", HTMLButtonElement).click();
            await nextTick();
            expect(rows()).toHaveLength(1000);
            expect(left()).toBe("1000 items left");
            part(found("todo-toggle-all"), "input", HTMLInputElement).click();
            await nextTick();
            part(found("todo-summary"), ".clear", HTMLButtonElement).click();
            await nextTick();
            expect(rows()).toHaveLength(0);
            expect(found("todo-summary").hasAttribute("empty")).toBe(true);
        });

        it("commits an edit when its field loses focus", async () => {
            await type("Buy milk");
            rowPart(0, ".label", HTMLElement).dispatchEvent(new MouseEvent("dblclick"));
            const edit = rowPart(0, ".edit", HTMLInputElement);
            edit.value = "Buy oat milk";
            edit.blur();
            await nextTick();
            expect(shown()).toEqual(["- Buy oat milk"]);
        });

        it("ignores what a row asks once its todo is deleted", async () => {
            await type("a");
            await type("b");
            // Both events come before the delete's run applies, so the edit and toggle find no todo.
            rowPart(0, ".delete", HTMLButtonElement).click();
            rowPart(0, ".toggle", HTMLInputElement).click();
            rows()[0]?.dispatchEvent(new CustomEvent("todo-edit", { detail: { label: "late" }, bubbles: true, composed: true }));
            await nextTick();
            expect(shown()).toEqual(["- b"]);
        });

        it("removes every row and stops listening when disposed", async () => {
            for (const text of ["a", "b"]) await type(text);
            await app.dispose();
            expect(rows()).toHaveLength(0);
            // Events after disposal start no runs, which would reject.
            part(found("todo-entry"), "input", HTMLInputElement).value = "c";
            part(found("todo-entry"), "input", HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
            expect(rows()).toHaveLength(0);
        });
    });

    // It runs in the tick that gives the todo its row, alongside createRows.
    const failing = System.create({ components: { with: [todo] } }, () => {
        throw new Error("a tick's system failed");
    });
    const failingObserver = System.create({ readonly: true, components: { with: [row], changed: [row] } }, () => {
        throw new Error("a tick's observer failed");
    });
    const pass = System.create({ readonly: true }, () => {});

    describe("the todo app's failures", () => {
        /** What the world reported, as `error` events on the page, which the browser logs unless they're handled. */
        let reported: string[] = [];
        const report = (event: ErrorEvent): void => {
            event.preventDefault();
            reported.push(event.error instanceof Error && event.error.cause instanceof Error ? event.error.cause.message : String(event.error));
        };
        beforeEach(() => {
            reported = [];
            window.addEventListener("error", report);
        });
        afterEach(() => {
            window.removeEventListener("error", report);
            // The test runner logs them as well.
            errors.length = 0;
        });

        it("are reported when a tick's system fails, once each", async () => {
            app.world.add(failing);
            await type("a");
            app.world.remove(failing);
            await app.world.run(pass);
            expect(reported).toEqual(["a tick's system failed"]);
        });

        it("surface when an event's run fails, its rejection unhandled, though another run follows it", async () => {
            const unhandled: string[] = [];
            const record = (event: PromiseRejectionEvent): void => {
                event.preventDefault();
                unhandled.push(event.reason instanceof Error ? event.reason.message : String(event.reason));
            };
            window.addEventListener("unhandledrejection", record);
            try {
                // A label that isn't text fails addTodo; the run after it, adding one, goes on.
                document.body.dispatchEvent(new CustomEvent("todo-add", { detail: { label: 7 }, bubbles: true }));
                await type("a");
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            finally {
                window.removeEventListener("unhandledrejection", record);
            }
            expect(unhandled).toEqual([expect.stringMatching(/^System "addTodo" .*failed: /)]);
            expect(shown()).toEqual(["- a"]);
        });

        it("are reported when a tick's observer fails", async () => {
            app.world.add(failingObserver);
            await type("a");
            app.world.remove(failingObserver);
            await app.world.run(pass);
            expect(reported).toEqual(["a tick's observer failed"]);
        });
    });
});

/** The fixed elements the DOM systems drive. */
const fixedMarkup = `<todo-toggle-all></todo-toggle-all><todo-list></todo-list><todo-summary></todo-summary><todo-filters></todo-filters>`;

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
const workOf = async (change: () => Promise<unknown>): Promise<Work> => {
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
    document.body.innerHTML = fixedMarkup;
    const app = createApp(document.body);
    await watchTicks(app.world);
    const { world } = app;
    await world.run(addGenerated, { count: n });
    await nextTick();
    const listed = [...document.querySelectorAll("todo-row")].map(entityOfElement);
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

/**
 * Each operation's work follows what it changed, whatever the list holds: both the DOM's mutations and how often the
 * DOM systems reach rows, since elements drop equal writes and systems skip rows already right, which would hide a
 * system that visits every row. `app/todo.perf-browser-test.ts` times them.
 */
describe("the work of each operation", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

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
});
