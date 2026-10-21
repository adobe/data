import { entityOf, entityOfElement } from "../../shared/attach.js";
import { all, on, type Connect } from "../../shared/connect.js";
import { addTodo, deleteTodo, editTodo, moveTodo, toggleTodo } from "./model.js";

export const connect: Connect = (world, root) => all(
    on(root, "todo-add", event => void world.run(addTodo, { label: event.detail.label })),
    on(root, "todo-toggle", event => void world.run(toggleTodo, { entity: entityOf(event) })),
    on(root, "todo-edit", event => void world.run(editTodo, { entity: entityOf(event), label: event.detail.label })),
    on(root, "todo-delete", event => void world.run(deleteTodo, { entity: entityOf(event) })),
    on(root, "todo-move", event => void world.run(moveTodo, { entity: entityOfElement(event.detail.item), before: entityOfElement(event.detail.before) })),
);
