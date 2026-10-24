// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { System } from "../../../index.js";
import { todo } from "../features/todos/data.js";
import { row } from "../features/todos/dom.js";
import { part } from "../shared/elements/elements.test-helper.js";
import { nextTick, watchTicks } from "../shared/ticks.test-helper.js";
import { createApp, type App } from "./app.js";

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
const failingObserver = System.create({ observer: true, components: { with: [row], changed: [row] } }, () => {
    throw new Error("a tick's observer failed");
});
const pass = System.create({ observer: true }, () => {});

describe("the todo app's failures", () => {
    /** The messages of the failures logged. */
    const tickFailures = (): string[] => errors.flatMap(values => Array.isArray(values) && values[0] === "A run failed" && Array.isArray(values[1])
        ? values[1].flatMap((failure: unknown) => typeof failure === "object" && failure !== null && "message" in failure ? [String(failure.message)] : [])
        : []);

    it("are logged when a tick's system fails, once each", async () => {
        app.world.add(failing);
        await type("a");
        app.world.remove(failing);
        await app.world.run(pass);
        expect(tickFailures()).toEqual(["a tick's system failed"]);
        errors.length = 0;
    });

    it("are logged when a tick's observer fails, by the next pass", async () => {
        app.world.add(failingObserver);
        await type("a");
        app.world.remove(failingObserver);
        await app.world.run(pass);
        expect(tickFailures()).toEqual(["a tick's observer failed"]);
        errors.length = 0;
    });
});
