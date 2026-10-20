/**
 * `<todo-entry>`: the field a new todo is typed into. Enter dispatches `todo-add` with the text and clears the field,
 * unless it holds only whitespace; Escape clears it. The draft is its own state.
 */

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; flex: 1; }
    input { box-sizing: border-box; width: 100%; font: inherit; padding: 12px; border: 0; background: none; outline: none; }
    input::placeholder { color: var(--todo-muted, #9ca3af); font-style: italic; }
</style>
<input placeholder="What needs to be done?" aria-label="New todo">`;

export type TodoEntryEvents = {
    readonly "todo-add": CustomEvent<{ readonly label: string }>;
};

const listen = (host: HTMLElement, input: HTMLInputElement): void => {
    input.addEventListener("keydown", event => {
        if (event.key === "Escape") input.value = "";
        // Enter while composing text picks the composition.
        if (event.key !== "Enter" || event.isComposing || input.value.trim() === "") return;
        host.dispatchEvent(new CustomEvent("todo-add", { detail: { label: input.value }, bubbles: true, composed: true }));
        input.value = "";
    });
};

export class TodoEntry extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({ mode: "open", delegatesFocus: true });
        root.append(template.content.cloneNode(true));
        const input = root.querySelector("input");
        if (input === null) throw new Error("todo-entry's template has no input.");
        listen(this, input);
    }
}

/** Defines `<todo-entry>`, once. */
export const defineTodoEntry = (): void => {
    if (customElements.get("todo-entry") === undefined) customElements.define("todo-entry", TodoEntry);
};

declare global {
    interface HTMLElementTagNameMap {
        "todo-entry": TodoEntry;
    }
    interface HTMLElementEventMap extends TodoEntryEvents {}
}
