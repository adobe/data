// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { EditStep } from "./type.edit-step.js";

/**
 * `<edit-path>`: the path to the model being edited, `steps`, the last being edited. Clicking an earlier step dispatches
 * `edit-path-leave` with its depth, or, for one with none, `edit-path-edit` with its model. Where the model edited is referenced from the library, it says which file edits
 * go to, with a button dispatching `edit-path-local` to make it the document's own.
 */
export class EditPath extends HTMLElement {
    #steps: readonly EditStep[] = [];
    readonly #path: HTMLElement;
    readonly #note: HTMLElement;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const path = root.querySelector<HTMLElement>(".path");
        const note = root.querySelector<HTMLElement>(".note");
        if (path === null || note === null) throw new Error("edit-path's template is incomplete.");
        this.#path = path;
        this.#note = note;
        root.addEventListener("click", event => {
            const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-depth], [data-edit], [data-local]") : null;
            if (target?.dataset["depth"] !== undefined) this.dispatchEvent(new CustomEvent("edit-path-leave", { detail: { depth: Number(target.dataset["depth"]) }, bubbles: true, composed: true }));
            else if (target?.dataset["edit"] !== undefined) this.dispatchEvent(new CustomEvent("edit-path-edit", { detail: { model: Number(target.dataset["edit"]) }, bubbles: true, composed: true }));
            else if (target?.dataset["local"] !== undefined) this.dispatchEvent(new CustomEvent("edit-path-local", { detail: { model: Number(target.dataset["local"]) }, bubbles: true, composed: true }));
        });
    }

    get steps(): readonly EditStep[] {
        return this.#steps;
    }

    set steps(value: readonly EditStep[]) {
        if (value.length === this.#steps.length && value.every((step, i) => {
            const was = this.#steps[i];
            return was !== undefined && was.label === step.label && was.model === step.model && was.referenced === step.referenced && was.depth === step.depth;
        })) return;
        this.#steps = value;
        this.#path.replaceChildren(...value.flatMap((step, index) => {
            const last = index === value.length - 1;
            const item = document.createElement(last ? "span" : "button");
            item.className = "step";
            item.textContent = step.label;
            if (!last && step.depth !== null) item.dataset["depth"] = String(step.depth);
            else if (!last) item.dataset["edit"] = String(step.model);
            return index === 0 ? [item] : [Object.assign(document.createElement("span"), { className: "sep", textContent: step.depth === null || value[index - 1]?.depth === null ? "·" : "›" }), item];
        }));
        const last = value.at(-1);
        this.#note.replaceChildren();
        if (last?.referenced !== null && last?.referenced !== undefined) {
            const text = Object.assign(document.createElement("span"), { textContent: `editing ${last.referenced}` });
            const local = Object.assign(document.createElement("button"), { className: "local", textContent: "Copy locally" });
            local.dataset["local"] = String(last.model);
            this.#note.append(text, local);
        }
    }
}

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; align-items: center; gap: 12px; font-size: 13px; }
    .path { display: flex; align-items: center; gap: 4px; }
    .step { font: inherit; color: inherit; background: none; border: 0; padding: 2px 4px; border-radius: 4px; }
    button.step { cursor: pointer; color: var(--editor-accent, #60a5fa); }
    button.step:hover { background: var(--editor-hover, rgb(127 127 127 / 0.15)); }
    .sep { opacity: 0.5; }
    .note { display: flex; align-items: center; gap: 8px; color: #fbbf24; }
    .local { font: inherit; font-size: 12px; color: inherit; background: none; border: 1px solid currentColor; border-radius: 4px; padding: 1px 6px; cursor: pointer; }
</style>
<nav class="path" aria-label="Editing"></nav>
<span class="note"></span>`;

type EditPathEvents = {
    readonly "edit-path-leave": CustomEvent<{ readonly depth: number }>;
    readonly "edit-path-local": CustomEvent<{ readonly model: number }>;
    readonly "edit-path-edit": CustomEvent<{ readonly model: number }>;
};

declare global {
    interface HTMLElementTagNameMap {
        "edit-path": EditPath;
    }
    interface HTMLElementEventMap extends EditPathEvents {}
}
