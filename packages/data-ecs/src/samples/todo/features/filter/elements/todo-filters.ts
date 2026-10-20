/**
 * `<todo-filters>`: the choice of which todos to show. Its `filter` property marks the chosen button; a click
 * dispatches `todo-filter` with the button's filter, and the owner writes `filter` back.
 */

export type Filter = "all" | "active" | "completed";

const filters: readonly Filter[] = ["all", "active", "completed"];

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; gap: 4px; }
    button { font: inherit; padding: 2px 8px; border: 1px solid transparent; border-radius: 4px; background: none;
        color: inherit; cursor: pointer; }
    button:hover { border-color: var(--todo-line, #e5e7eb); }
    button[aria-pressed="true"] { border-color: var(--todo-accent, #2563eb); color: var(--todo-accent, #2563eb); }
</style>
<button data-filter="all" aria-pressed="true">All</button>
<button data-filter="active" aria-pressed="false">Active</button>
<button data-filter="completed" aria-pressed="false">Completed</button>`;

export type TodoFiltersEvents = {
    readonly "todo-filter": CustomEvent<{ readonly filter: Filter }>;
};

const isFilter = (value: string | undefined): value is Filter => filters.some(item => item === value);

const listen = (host: HTMLElement, root: ShadowRoot): void => {
    root.addEventListener("click", event => {
        const chosen = event.target instanceof HTMLButtonElement ? event.target.dataset.filter : undefined;
        if (isFilter(chosen)) host.dispatchEvent(new CustomEvent("todo-filter", { detail: { filter: chosen }, bubbles: true, composed: true }));
    });
};

const show = (root: ShadowRoot, chosen: Filter): void => {
    for (const button of root.querySelectorAll("button")) {
        const pressed = String(button.dataset.filter === chosen);
        if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
    }
};

export class TodoFilters extends HTMLElement {
    readonly #root: ShadowRoot;
    #filter: Filter = "all";

    constructor() {
        super();
        this.#root = this.attachShadow({ mode: "open" });
        this.#root.append(template.content.cloneNode(true));
        listen(this, this.#root);
    }

    get filter(): Filter {
        return this.#filter;
    }

    set filter(value: Filter) {
        if (value === this.#filter) return;
        this.#filter = value;
        show(this.#root, value);
    }
}

/** Defines `<todo-filters>`, once. */
export const defineTodoFilters = (): void => {
    if (customElements.get("todo-filters") === undefined) customElements.define("todo-filters", TodoFilters);
};

declare global {
    interface HTMLElementTagNameMap {
        "todo-filters": TodoFilters;
    }
    interface HTMLElementEventMap extends TodoFiltersEvents {}
}
