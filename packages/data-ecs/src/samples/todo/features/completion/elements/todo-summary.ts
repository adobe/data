/**
 * `<todo-summary>`: how many todos are left, and the button that clears those done, shown only while some are.
 * Properties `remaining` and `completed` drive it; `empty`, reflected as an attribute, is set while both are 0. The
 * button dispatches `todo-clear-completed`.
 */

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: contents; }
    .count { white-space: nowrap; }
    button { font: inherit; padding: 2px 8px; border: 0; background: none; color: inherit; cursor: pointer; }
    button:hover { text-decoration: underline; }
    [hidden] { display: none; }
</style>
<span class="count"></span>
<button class="clear" hidden>Clear completed</button>`;

export type TodoSummaryEvents = {
    readonly "todo-clear-completed": CustomEvent<null>;
};

type Parts = { readonly count: HTMLElement; readonly clear: HTMLButtonElement };

const partsOf = (root: ShadowRoot): Parts => {
    const count = root.querySelector(".count");
    const clear = root.querySelector(".clear");
    if (!(count instanceof HTMLElement) || !(clear instanceof HTMLButtonElement)) throw new Error("todo-summary's template is missing a part.");
    return { count, clear };
};

const remainingText = (remaining: number): string => `${remaining} ${remaining === 1 ? "item" : "items"} left`;

export class TodoSummary extends HTMLElement {
    readonly #parts: Parts;
    #remaining = 0;
    #completed = 0;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        this.#parts = partsOf(root);
        this.#parts.count.textContent = remainingText(0);
        this.#parts.clear.addEventListener("click", () => {
            this.dispatchEvent(new CustomEvent("todo-clear-completed", { detail: null, bubbles: true, composed: true }));
        });
    }

    connectedCallback(): void {
        this.toggleAttribute("empty", this.#remaining + this.#completed === 0);
    }

    get remaining(): number {
        return this.#remaining;
    }

    set remaining(value: number) {
        if (value === this.#remaining) return;
        this.#remaining = value;
        this.#parts.count.textContent = remainingText(value);
        this.toggleAttribute("empty", value + this.#completed === 0);
    }

    get completed(): number {
        return this.#completed;
    }

    set completed(value: number) {
        if (value === this.#completed) return;
        this.#completed = value;
        this.#parts.clear.hidden = value === 0;
        this.toggleAttribute("empty", this.#remaining + value === 0);
    }
}

/** Defines `<todo-summary>`, once. */
export const defineTodoSummary = (): void => {
    if (customElements.get("todo-summary") === undefined) customElements.define("todo-summary", TodoSummary);
};

declare global {
    interface HTMLElementTagNameMap {
        "todo-summary": TodoSummary;
    }
    interface HTMLElementEventMap extends TodoSummaryEvents {}
}
