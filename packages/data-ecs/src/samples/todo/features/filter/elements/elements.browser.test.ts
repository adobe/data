import { afterEach, describe, expect, it } from "vitest";
import { mutationsOf, part, record } from "../../../shared/elements/elements.test-helper.js";
import { defineTodoFilters } from "./todo-filters.js";

defineTodoFilters();

afterEach(() => {
    document.body.replaceChildren();
});

describe("todo-filters", () => {
    const pressed = (filters: HTMLElement): string[] => [...filters.shadowRoot?.querySelectorAll("button[aria-pressed=true]") ?? []].map(button => button.textContent ?? "");

    it("marks the button of its filter", () => {
        const filters = document.createElement("todo-filters");
        document.body.append(filters);
        expect(pressed(filters)).toEqual(["All"]);
        filters.filter = "completed";
        expect(pressed(filters)).toEqual(["Completed"]);
    });

    it("writes only the buttons whose state changes", () => {
        const filters = document.createElement("todo-filters");
        document.body.append(filters);
        expect(mutationsOf(filters, () => {
            filters.filter = "active";
        }).map(record => record.target instanceof HTMLElement ? record.target.dataset.filter : null)).toEqual(["all", "active"]);
    });

    it("dispatches todo-filter with a clicked button's filter, keeping the filter it was given", () => {
        const filters = document.createElement("todo-filters");
        document.body.append(filters);
        const seen = record(document.body, "todo-filter");
        part(filters, "[data-filter=active]", HTMLButtonElement).click();
        part(filters, "[data-filter=all]", HTMLButtonElement).click();
        expect(seen).toEqual([
            { type: "todo-filter", detail: { filter: "active" }, target: filters },
            { type: "todo-filter", detail: { filter: "all" }, target: filters },
        ]);
        expect(pressed(filters)).toEqual(["All"]);
    });
});
