// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { TodoEntry, TodoList, TodoRow } from "../elements/index.js";
import { addTodo, deleteTodo, editTodo, moveTodo, systems as model, toggleTodo } from "../model/index.js";
import { all, define, entityOf, entityOfElement, on } from "../../page/view/index.js";
import { systems } from "./constant.systems.js";

/**
 * Todos on the page within `root`: adding, toggling, editing, deleting and moving them, through its elements' events,
 * and their rows in its list.
 */
export const todosPlugin: Plugin<"root"> = {
    systems: [...model, ...systems],
    connect: (world, { root }) => {
        define({ "todo-entry": TodoEntry, "todo-list": TodoList, "todo-row": TodoRow });
        return all(
            on(root, "todo-add", event => void world.run(addTodo, { label: event.detail.label })),
            on(root, "todo-toggle", event => void world.run(toggleTodo, { entity: entityOf(event) })),
            on(root, "todo-edit", event => void world.run(editTodo, { entity: entityOf(event), label: event.detail.label })),
            on(root, "todo-delete", event => void world.run(deleteTodo, { entity: entityOf(event) })),
            on(root, "todo-move", event => void world.run(moveTodo, { entity: entityOfElement(event.detail.item), before: entityOfElement(event.detail.before) })),
        );
    },
};

declare module "@adobe/ecs" {
    interface PluginConfig {
        /** The page's element holding the app's markup, whose events the plugins listen for. */
        root: HTMLElement;
    }
}
