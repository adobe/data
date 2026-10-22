/**
 * `<todo-toggle-all>`: the checkbox that marks every todo done, or none. Property `checked` is whether all are done,
 * and `empty`, reflected as an attribute, hides it while there are none. A click dispatches `todo-toggle-all` with
 * the state chosen, and the owner writes `checked` back.
 */

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; align-items: center; padding-left: 12px; }
    :host([empty]) { visibility: hidden; }
    input { width: 18px; height: 18px; margin: 0; accent-color: var(--todo-accent, #2563eb); }
</style>
<input type="checkbox" aria-label="Mark all as complete">`;

export type TodoToggleAllEvents = {
    readonly "todo-toggle-all": CustomEvent<{ readonly done: boolean }>;
};

export class TodoToggleAll extends HTMLElement {
    readonly #input: HTMLInputElement;
    #checked = false;
    #empty = true;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const input = root.querySelector("input");
        if (input === null) throw new Error("todo-toggle-all's template has no input.");
        this.#input = input;
        input.addEventListener("change", () => {
            const chosen = input.checked;
            input.checked = this.#checked;
            this.dispatchEvent(new CustomEvent("todo-toggle-all", { detail: { done: chosen }, bubbles: true, composed: true }));
        });
    }

    connectedCallback(): void {
        this.toggleAttribute("empty", this.#empty);
    }

    get checked(): boolean {
        return this.#checked;
    }

    set checked(value: boolean) {
        if (value === this.#checked) return;
        this.#checked = value;
        this.#input.checked = value;
    }

    get empty(): boolean {
        return this.#empty;
    }

    set empty(value: boolean) {
        if (value === this.#empty) return;
        this.#empty = value;
        this.toggleAttribute("empty", value);
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "todo-toggle-all": TodoToggleAll;
    }
    interface HTMLElementEventMap extends TodoToggleAllEvents {}
}
