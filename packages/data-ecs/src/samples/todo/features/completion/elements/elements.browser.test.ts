import { afterEach, describe, expect, it } from "vitest";
import { part, record } from "../../../shared/elements/elements.test-helper.js";
import { TodoSummary } from "./todo-summary.js";
import { TodoToggleAll } from "./todo-toggle-all.js";
import { define } from "../../../shared/elements/define.js";

define({ "todo-summary": TodoSummary, "todo-toggle-all": TodoToggleAll });

afterEach(() => {
    document.body.replaceChildren();
});

describe("todo-summary", () => {
    it("shows what's left, and the clear button only while some are done; empty while there are none", () => {
        const summary = document.createElement("todo-summary");
        document.body.append(summary);
        const count = part(summary, ".count", HTMLElement);
        const clear = part(summary, ".clear", HTMLButtonElement);
        expect(summary.hasAttribute("empty")).toBe(true);
        expect(count.textContent).toBe("0 items left");
        expect(clear.hidden).toBe(true);
        summary.remaining = 1;
        expect(summary.hasAttribute("empty")).toBe(false);
        expect(count.textContent).toBe("1 item left");
        summary.completed = 2;
        expect(clear.hidden).toBe(false);
        summary.remaining = 0;
        expect(summary.hasAttribute("empty")).toBe(false);
        summary.completed = 0;
        expect(summary.hasAttribute("empty")).toBe(true);
        expect(clear.hidden).toBe(true);
    });

    it("dispatches todo-clear-completed", () => {
        const summary = document.createElement("todo-summary");
        document.body.append(summary);
        summary.completed = 1;
        const seen = record(document.body, "todo-clear-completed");
        part(summary, ".clear", HTMLButtonElement).click();
        expect(seen).toEqual([{ type: "todo-clear-completed", detail: null, target: summary }]);
    });
});

describe("todo-toggle-all", () => {
    it("is empty until told otherwise, and checked as told", () => {
        const toggleAll = document.createElement("todo-toggle-all");
        document.body.append(toggleAll);
        expect(toggleAll.hasAttribute("empty")).toBe(true);
        toggleAll.empty = false;
        toggleAll.checked = true;
        expect(toggleAll.hasAttribute("empty")).toBe(false);
        expect(part(toggleAll, "input", HTMLInputElement).checked).toBe(true);
    });

    it("dispatches todo-toggle-all with the state clicked, keeping the state it was given", () => {
        const toggleAll = document.createElement("todo-toggle-all");
        document.body.append(toggleAll);
        const seen = record(document.body, "todo-toggle-all");
        const input = part(toggleAll, "input", HTMLInputElement);
        input.click();
        expect(seen).toEqual([{ type: "todo-toggle-all", detail: { done: true }, target: toggleAll }]);
        expect(input.checked).toBe(false);
        toggleAll.checked = true;
        input.click();
        expect(seen[1]?.detail).toEqual({ done: false });
        expect(input.checked).toBe(true);
    });
});
