// © 2026 Adobe. MIT License. See /LICENSE for details.
import { VirtualList } from "../../virtual-list/elements/index.js";
import type { TodoRow } from "./element.todo-row.js";

/**
 * `<todo-list>`: a `<virtual-list>` of `<todo-row>`s, saying "Nothing to do." when it has none. Dragging a row onto
 * another, or Alt+ArrowUp and Alt+ArrowDown on a focused row, dispatches `todo-move` with the row and the one it should
 * go before, null for the end; the list never moves rows itself, and a move to an item with no row is dropped.
 */
export class TodoList extends VirtualList<unknown, TodoRow> {
    constructor() {
        super();
        this.create = () => document.createElement("todo-row");
        this.shadowRoot?.append(style.content.cloneNode(true));
        this.shadowRoot?.querySelector("slot")?.append(empty.content.cloneNode(true));
        listen(this);
    }
}

const style = document.createElement("template");
style.innerHTML = `
<style>
    .empty { margin: 0; padding: 32px 12px; text-align: center; color: var(--todo-muted, #9ca3af); }
</style>`;

const empty = document.createElement("template");
empty.innerHTML = `<p class="empty">Nothing to do.</p>`;

type TodoListEvents = {
    readonly "todo-move": CustomEvent<{ readonly item: HTMLElement; readonly before: HTMLElement | null }>;
};

/**
 * Dispatches a move of `item` to before the item at `index`, the end once it's past the last; nothing when that item
 * has no row.
 */
const move = (list: TodoList, item: HTMLElement, index: number): void => {
    const before = index >= list.count ? null : list.elementAt(index);
    if (item === before || (before === null && index < list.count)) return;
    list.dispatchEvent(new CustomEvent("todo-move", { detail: { item, before }, bubbles: true, composed: true }));
};

/** The list's row an event came from, or null. */
const rowOf = (list: TodoList, target: EventTarget | null): HTMLElement | null => {
    for (let node = target instanceof Node ? target : null; node !== null; node = node.parentNode) {
        if (node.parentNode === list) return node instanceof HTMLElement && list.indexOf(node) >= 0 ? node : null;
    }
    return null;
};

const listen = (list: TodoList): void => {
    let dragged: HTMLElement | null = null;
    list.addEventListener("dragstart", event => {
        dragged = rowOf(list, event.target);
        if (dragged !== null && event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
    });
    list.addEventListener("dragover", event => {
        if (dragged !== null) event.preventDefault();
    });
    list.addEventListener("drop", event => {
        const item = dragged;
        dragged = null;
        const target = rowOf(list, event.target);
        if (item === null || target === null) return;
        event.preventDefault();
        const bounds = target.getBoundingClientRect();
        const index = list.indexOf(target);
        move(list, item, event.clientY < bounds.top + bounds.height / 2 ? index : index + 1);
    });
    list.addEventListener("dragend", () => {
        dragged = null;
    });
    list.addEventListener("keydown", event => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        const item = rowOf(list, event.target);
        if (item === null) return;
        event.preventDefault();
        const index = list.indexOf(item);
        if (event.key === "ArrowUp") {
            if (index > 0) move(list, item, index - 1);
        }
        else if (index + 1 < list.count) move(list, item, index + 2);
    });
};


declare global {
    interface HTMLElementTagNameMap {
        "todo-list": TodoList;
    }
    interface HTMLElementEventMap extends TodoListEvents {}
}
