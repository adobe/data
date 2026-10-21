/** `<todo-generate>`: buttons that ask for generated todos, each dispatching `todo-generate` with its count. */

const counts = [10, 1000];

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; gap: 6px; }
    button { font: inherit; font-size: 12px; padding: 4px 10px; border: 1px solid var(--todo-line, #e5e7eb); border-radius: 4px;
        background: var(--todo-surface, #fff); color: inherit; cursor: pointer; }
    button:hover { border-color: var(--todo-accent, #2563eb); }
</style>
${counts.map(count => `<button data-count="${count}">Add ${count.toLocaleString("en-US")}</button>`).join("")}`;

export type TodoGenerateEvents = {
    readonly "todo-generate": CustomEvent<{ readonly count: number }>;
};

export class TodoGenerate extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        root.addEventListener("click", event => {
            const count = event.target instanceof HTMLButtonElement ? Number(event.target.dataset.count) : NaN;
            if (Number.isInteger(count)) this.dispatchEvent(new CustomEvent("todo-generate", { detail: { count }, bubbles: true, composed: true }));
        });
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "todo-generate": TodoGenerate;
    }
    interface HTMLElementEventMap extends TodoGenerateEvents {}
}
