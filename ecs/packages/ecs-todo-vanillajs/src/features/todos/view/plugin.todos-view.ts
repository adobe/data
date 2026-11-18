// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { TodoEntry, TodoList, TodoRow } from "../elements/index.js";
import { addTodo, deleteTodo, editTodo, moveTodo, toggleTodo } from "../model/index.js";
import { all, define, entityOf, entityOfElement, on, root } from "../../../view/index.js";
import { findList } from "./plugin.todos-view/system.find-list.js";
import { renderRows } from "./plugin.todos-view/system.render-rows.js";
import { bindRows } from "./plugin.todos-view/system.bind-rows.js";
import { completionView } from "../features/completion/view/index.js";
import { filterView } from "../features/filter/view/index.js";
import { generateView } from "../features/generate/view/index.js";

/**
 * Todos on the page within the app's root: adding, toggling, editing, deleting and moving them, through its elements' events,
 * and their rows in its list, rendered again as scrolling changes the range it needs and removed once disconnected; with
 * its sub-features' views, filtering, completion and generating, composed in.
 */
export const todosView: Plugin<typeof root> = {
    systems: [findList, renderRows, bindRows, ...filterView.systems, ...completionView.systems, ...generateView.systems],
    connect: (world, { [root]: page }) => {
        define({ "todo-entry": TodoEntry, "todo-list": TodoList, "todo-row": TodoRow });
        const element = page.querySelector("todo-list");
        return all(
            ...[filterView, completionView, generateView].map(sub => sub.connect?.(world, { [root]: page }) ?? (() => {})),
            on(page, "virtual-range", () => void world.run(renderRows)),
            on(page, "todo-add", event => void world.run(addTodo, { label: event.detail.label })),
            on(page, "todo-toggle", event => void world.run(toggleTodo, { entity: entityOf(event) })),
            on(page, "todo-edit", event => void world.run(editTodo, { entity: entityOf(event), label: event.detail.label })),
            on(page, "todo-delete", event => void world.run(deleteTodo, { entity: entityOf(event) })),
            on(page, "todo-move", event => void world.run(moveTodo, { entity: entityOfElement(event.detail.item), before: entityOfElement(event.detail.before) })),
            () => element?.render(0, [], () => {}),
        );
    },
};
