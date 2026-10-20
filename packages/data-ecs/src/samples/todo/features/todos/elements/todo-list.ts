/**
 * `<todo-list>`: holds rows as its children, in the order they're placed. Dragging a child onto another, or
 * Alt+ArrowUp and Alt+ArrowDown on a focused child, dispatches `todo-move` with the child and the one it should go
 * before, null for the end, skipping hidden children; the list never moves children itself.
 */

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; overflow-y: auto; }
    .empty { margin: 0; padding: 32px 12px; text-align: center; color: var(--todo-muted, #9ca3af); }
</style>
<slot><p class="empty">Nothing to do.</p></slot>`;

export type TodoListEvents = {
    readonly "todo-move": CustomEvent<{ readonly item: HTMLElement; readonly before: HTMLElement | null }>;
};

const move = (list: HTMLElement, item: HTMLElement, before: HTMLElement | null): void => {
    if (item === before) return;
    list.dispatchEvent(new CustomEvent("todo-move", { detail: { item, before }, bubbles: true, composed: true }));
};

/** The list's child an event came from, or null. */
const childOf = (list: HTMLElement, target: EventTarget | null): HTMLElement | null => {
    for (let node = target instanceof Node ? target : null; node !== null; node = node.parentNode) {
        if (node.parentNode === list) return node instanceof HTMLElement ? node : null;
    }
    return null;
};

const siblingOf = (node: Element, forward: boolean): Element | null => forward ? node.nextElementSibling : node.previousElementSibling;

/** The nearest sibling shown, in the direction given, or null. */
const shownSibling = (item: Element, forward: boolean): HTMLElement | null => {
    for (let node = siblingOf(item, forward); node !== null; node = siblingOf(node, forward)) {
        if (node instanceof HTMLElement && node.checkVisibility()) return node;
    }
    return null;
};

const listen = (list: HTMLElement): void => {
    let dragged: HTMLElement | null = null;
    list.addEventListener("dragstart", event => {
        dragged = childOf(list, event.target);
        if (dragged !== null && event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
    });
    list.addEventListener("dragover", event => {
        if (dragged !== null) event.preventDefault();
    });
    list.addEventListener("drop", event => {
        const item = dragged;
        dragged = null;
        const target = childOf(list, event.target);
        if (item === null || target === null) return;
        event.preventDefault();
        const bounds = target.getBoundingClientRect();
        const after = target.nextElementSibling instanceof HTMLElement ? target.nextElementSibling : null;
        move(list, item, event.clientY < bounds.top + bounds.height / 2 ? target : after);
    });
    list.addEventListener("dragend", () => {
        dragged = null;
    });
    list.addEventListener("keydown", event => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        const item = childOf(list, event.target);
        if (item === null) return;
        event.preventDefault();
        if (event.key === "ArrowUp") {
            const previous = shownSibling(item, false);
            if (previous !== null) move(list, item, previous);
        }
        else {
            const next = shownSibling(item, true);
            if (next !== null) move(list, item, shownSibling(next, true));
        }
    });
};

export class TodoList extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
        listen(this);
    }
}

/** Defines `<todo-list>`, once. */
export const defineTodoList = (): void => {
    if (customElements.get("todo-list") === undefined) customElements.define("todo-list", TodoList);
};

declare global {
    interface HTMLElementTagNameMap {
        "todo-list": TodoList;
    }
    interface HTMLElementEventMap extends TodoListEvents {}
}
