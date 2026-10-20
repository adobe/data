/**
 * `<todo-row>`: one todo. Properties `label` and `done` drive it, and `done` is reflected as an attribute for styling;
 * `hidden` hides it, as it does any element. It dispatches `todo-toggle`, `todo-delete` and `todo-edit`, and never
 * changes its properties itself: whoever owns the todo writes them back. Editing is its own state, as focus is.
 */

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; align-items: center; gap: 12px; box-sizing: border-box; min-height: 44px; padding: 0 12px;
        border-bottom: 1px solid var(--todo-line, #e5e7eb); background: var(--todo-surface, #fff); }
    /* The display above would otherwise show a hidden row. */
    /* Rows out of view skip their rendering: at 10K, laying them out takes a third of the time, and filtering a quarter. */
    :host { content-visibility: auto; contain-intrinsic-size: auto 44px; }
    :host([hidden]) { display: none; }
    :host(:hover) { background: var(--todo-hover, #f9fafb); }
    :host([done]) .label { text-decoration: line-through; color: var(--todo-muted, #9ca3af); }
    .toggle { flex-shrink: 0; width: 18px; height: 18px; margin: 0; accent-color: var(--todo-accent, #2563eb); }
    .label { flex: 1; padding: 10px 0; word-break: break-word; cursor: grab; }
    .edit { flex: 1; font: inherit; padding: 6px 8px; border: 1px solid var(--todo-accent, #2563eb); border-radius: 4px; }
    .delete { flex-shrink: 0; border: 0; background: none; font-size: 18px; line-height: 1; color: var(--todo-muted, #9ca3af);
        cursor: pointer; opacity: 0; }
    :host(:hover) .delete, .delete:focus-visible { opacity: 1; }
    .delete:hover { color: var(--todo-danger, #dc2626); }
    [hidden] { display: none; }
</style>
<input class="toggle" type="checkbox" aria-label="Toggle complete">
<span class="label"></span>
<input class="edit" aria-label="Edit todo" hidden>
<button class="delete" aria-label="Delete todo">×</button>`;

export type TodoRowEvents = {
    readonly "todo-toggle": CustomEvent<null>;
    readonly "todo-delete": CustomEvent<null>;
    readonly "todo-edit": CustomEvent<{ readonly label: string }>;
};

const dispatch = <K extends keyof TodoRowEvents>(target: HTMLElement, type: K, detail: TodoRowEvents[K]["detail"]): void => {
    target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
};

/** The row's parts, found once in its shadow root. */
type Parts = { readonly toggle: HTMLInputElement; readonly label: HTMLElement; readonly edit: HTMLInputElement; readonly delete: HTMLButtonElement };

const partsOf = (root: ShadowRoot): Parts => {
    const toggle = root.querySelector(".toggle");
    const label = root.querySelector(".label");
    const edit = root.querySelector(".edit");
    const remove = root.querySelector(".delete");
    const found = toggle instanceof HTMLInputElement && label instanceof HTMLElement && edit instanceof HTMLInputElement && remove instanceof HTMLButtonElement;
    if (!found) {
        throw new Error("todo-row's template is missing a part.");
    }
    return { toggle, label, edit, delete: remove };
};

/** Starts editing. The row isn't draggable meanwhile, so the text being edited can be selected. */
const startEditing = (host: HTMLElement, parts: Parts): void => {
    parts.edit.value = parts.label.textContent ?? "";
    parts.label.hidden = true;
    parts.edit.hidden = false;
    host.draggable = false;
    parts.edit.focus();
};

/** Leaves editing, dispatching the new label when `commit` is set. */
const stopEditing = (host: HTMLElement, parts: Parts, commit: boolean): void => {
    if (parts.edit.hidden) return;
    parts.edit.hidden = true;
    parts.label.hidden = false;
    host.draggable = true;
    if (commit) dispatch(host, "todo-edit", { label: parts.edit.value });
};

const listen = (host: HTMLElement, parts: Parts, done: () => boolean): void => {
    parts.toggle.addEventListener("change", () => {
        // The owner writes `done` back; until then the checkbox shows the value it was given.
        parts.toggle.checked = done();
        dispatch(host, "todo-toggle", null);
    });
    parts.delete.addEventListener("click", () => dispatch(host, "todo-delete", null));
    parts.label.addEventListener("dblclick", () => startEditing(host, parts));
    parts.edit.addEventListener("keydown", event => {
        // Enter while composing text picks the composition.
        if (event.key === "Enter" && !event.isComposing) stopEditing(host, parts, true);
        else if (event.key === "Escape") stopEditing(host, parts, false);
    });
    parts.edit.addEventListener("blur", () => stopEditing(host, parts, true));
};

export class TodoRow extends HTMLElement {
    readonly #parts: Parts;
    #label = "";
    #done = false;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        this.#parts = partsOf(root);
        listen(this, this.#parts, () => this.#done);
    }

    /** Placing a row connects it again, so attributes are set only once. */
    connectedCallback(): void {
        if (this.hasAttribute("tabindex")) return;
        this.tabIndex = 0;
        this.draggable = true;
    }

    get label(): string {
        return this.#label;
    }

    set label(value: string) {
        if (value === this.#label) return;
        this.#label = value;
        this.#parts.label.textContent = value;
    }

    get done(): boolean {
        return this.#done;
    }

    set done(value: boolean) {
        if (value === this.#done) return;
        this.#done = value;
        this.#parts.toggle.checked = value;
        this.toggleAttribute("done", value);
    }
}

/** Defines `<todo-row>`, once. */
export const defineTodoRow = (): void => {
    if (customElements.get("todo-row") === undefined) customElements.define("todo-row", TodoRow);
};

declare global {
    interface HTMLElementTagNameMap {
        "todo-row": TodoRow;
    }
    interface HTMLElementEventMap extends TodoRowEvents {}
}
