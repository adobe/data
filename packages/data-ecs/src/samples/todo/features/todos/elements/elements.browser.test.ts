import { afterEach, describe, expect, it } from "vitest";
import { mutationsOf, part, record } from "../../../shared/elements/elements.test-helper.js";
import { defineTodoEntry } from "./todo-entry.js";
import { defineTodoList } from "./todo-list.js";
import { defineTodoRow } from "./todo-row.js";

defineTodoRow();
defineTodoList();
defineTodoEntry();

afterEach(() => {
    document.body.replaceChildren();
});

const createRow = (label: string, done = false): HTMLElementTagNameMap["todo-row"] => {
    const row = document.createElement("todo-row");
    row.label = label;
    row.done = done;
    document.body.append(row);
    return row;
};

describe("todo-row", () => {
    it("renders its label and done state, reflecting done as an attribute", () => {
        const row = createRow("Buy milk");
        expect(part(row, ".label", HTMLElement).textContent).toBe("Buy milk");
        expect(part(row, ".toggle", HTMLInputElement).checked).toBe(false);
        expect(row.hasAttribute("done")).toBe(false);
        row.done = true;
        row.label = "Buy oat milk";
        expect(part(row, ".toggle", HTMLInputElement).checked).toBe(true);
        expect(row.hasAttribute("done")).toBe(true);
        expect(part(row, ".label", HTMLElement).textContent).toBe("Buy oat milk");
    });

    it("drops writes of the value it has", () => {
        const row = createRow("Buy milk", true);
        expect(mutationsOf(row, () => {
            row.label = "Buy milk";
            row.done = true;
        })).toEqual([]);
    });

    it("dispatches todo-toggle on a click, keeping the done state it was given", () => {
        const row = createRow("Buy milk");
        const seen = record(document.body, "todo-toggle");
        part(row, ".toggle", HTMLInputElement).click();
        expect(seen).toEqual([{ type: "todo-toggle", detail: null, target: row }]);
        expect(row.done).toBe(false);
        expect(part(row, ".toggle", HTMLInputElement).checked).toBe(false);
    });

    it("dispatches todo-delete", () => {
        const row = createRow("Buy milk");
        const seen = record(document.body, "todo-delete");
        part(row, ".delete", HTMLButtonElement).click();
        expect(seen).toEqual([{ type: "todo-delete", detail: null, target: row }]);
    });

    it("edits on a double click: Enter and blur dispatch todo-edit, Escape cancels, and the label stays as given", () => {
        const row = createRow("Buy milk");
        const seen = record(document.body, "todo-edit");
        const label = part(row, ".label", HTMLElement);
        const edit = part(row, ".edit", HTMLInputElement);
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        expect(edit.hidden).toBe(false);
        expect(edit.value).toBe("Buy milk");
        expect(row.shadowRoot?.activeElement).toBe(edit);
        edit.value = "Buy oat milk";
        edit.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(seen).toEqual([{ type: "todo-edit", detail: { label: "Buy oat milk" }, target: row }]);
        expect(edit.hidden).toBe(true);
        expect(label.textContent).toBe("Buy milk");

        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        edit.value = "Never mind";
        edit.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(seen).toHaveLength(1);

        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        edit.value = "Blurred";
        edit.blur();
        expect(seen.map(event => event.detail)).toEqual([{ label: "Buy oat milk" }, { label: "Blurred" }]);
    });

    it("is focusable and draggable once connected, and can be created before it is", () => {
        const row = document.createElement("todo-row");
        expect(row.hasAttribute("tabindex")).toBe(false);
        document.body.append(row);
        expect(row.tabIndex).toBe(0);
        expect(row.draggable).toBe(true);
    });
});

describe("todo-list", () => {
    const createList = (...labels: string[]): { readonly list: HTMLElementTagNameMap["todo-list"]; readonly rows: HTMLElementTagNameMap["todo-row"][] } => {
        const list = document.createElement("todo-list");
        document.body.append(list);
        const rows = labels.map((label, i) => {
            const row = document.createElement("todo-row");
            row.label = label;
            row.done = i % 2 === 1;
            list.append(row);
            return row;
        });
        return { list, rows };
    };

    const shown = (rows: readonly HTMLElement[]): boolean[] => rows.map(row => row.checkVisibility());

    it("hides children by its filter, reflected as an attribute", () => {
        const { list, rows } = createList("a", "b", "c");
        expect(shown(rows)).toEqual([true, true, true]);
        list.filter = "active";
        expect(list.getAttribute("filter")).toBe("active");
        expect(shown(rows)).toEqual([true, false, true]);
        list.filter = "completed";
        expect(shown(rows)).toEqual([false, true, false]);
        rows[0]!.done = true;
        expect(shown(rows)).toEqual([true, true, false]);
        list.filter = "all";
        expect(shown(rows)).toEqual([true, true, true]);
    });

    it("dispatches todo-move for Alt+ArrowUp and Alt+ArrowDown, skipping hidden children, and never moves them itself", () => {
        const { list, rows } = createList("a", "b", "c", "d");
        const [a, b, c, d] = rows;
        const seen = record(document.body, "todo-move");
        c!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }));
        a!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }));
        b!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }));
        // At either end, there's nowhere to go.
        a!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }));
        d!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }));
        c!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
        expect(seen.map(event => event.detail)).toEqual([{ item: c, before: b }, { item: a, before: c }, { item: b, before: d }]);
        list.filter = "active";
        c!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }));
        a!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }));
        expect(seen.slice(3).map(event => event.detail)).toEqual([{ item: a, before: null }]);
        expect([...list.children]).toEqual(rows);
    });

    it("dispatches todo-move for a drop: before the child dropped on, or after it in its lower half", () => {
        const { list, rows } = createList("a", "b", "c");
        const [a, , c] = rows;
        const seen = record(document.body, "todo-move");
        const drop = (item: HTMLElement, onto: HTMLElement, lower: boolean): void => {
            const dataTransfer = new DataTransfer();
            item.dispatchEvent(new DragEvent("dragstart", { bubbles: true, composed: true, dataTransfer }));
            const bounds = onto.getBoundingClientRect();
            const clientY = lower ? bounds.bottom - 1 : bounds.top + 1;
            onto.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, composed: true, dataTransfer, clientY }));
            onto.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, composed: true, dataTransfer, clientY }));
        };
        drop(c!, a!, false);
        drop(a!, c!, true);
        expect(seen.map(event => event.detail)).toEqual([{ item: c, before: a }, { item: a, before: null }]);
        expect([...list.children]).toEqual(rows);
    });
});

describe("todo-entry", () => {
    it("dispatches todo-add on Enter and clears itself, ignoring blank text; Escape clears", () => {
        const entry = document.createElement("todo-entry");
        document.body.append(entry);
        const seen = record(document.body, "todo-add");
        const input = part(entry, "input", HTMLInputElement);
        input.value = "Buy milk";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(seen).toEqual([{ type: "todo-add", detail: { label: "Buy milk" }, target: entry }]);
        expect(input.value).toBe("");
        input.value = "   ";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(seen).toHaveLength(1);
        input.value = "Draft";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(input.value).toBe("");
    });
});
