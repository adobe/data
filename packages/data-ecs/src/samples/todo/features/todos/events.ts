import { Entity } from "../../../../index.js";
import { on, reported, type Connect } from "../../shared/connect.js";
import { todoOf } from "./dom.js";
import { addTodo, deleteTodo, editTodo, moveTodo, toggleTodo } from "./model.js";

/** The todo a row shows, or none for anything else. */
const todoAt = (target: EventTarget | null): Entity => (target instanceof Element ? todoOf.get(target) : undefined) ?? Entity.none;

export const connect: Connect = (world, root) => {
    const disconnects = [
        on(root, "todo-add", event => void reported(world.run(addTodo, { label: event.detail.label }))),
        on(root, "todo-toggle", event => void reported(world.run(toggleTodo, { entity: todoAt(event.target) }))),
        on(root, "todo-edit", event => void reported(world.run(editTodo, { entity: todoAt(event.target), label: event.detail.label }))),
        on(root, "todo-delete", event => void reported(world.run(deleteTodo, { entity: todoAt(event.target) }))),
        on(root, "todo-move", event => void reported(world.run(moveTodo, { entity: todoAt(event.detail.item), before: todoAt(event.detail.before) }))),
    ];
    return () => {
        for (const disconnect of disconnects) disconnect();
    };
};
