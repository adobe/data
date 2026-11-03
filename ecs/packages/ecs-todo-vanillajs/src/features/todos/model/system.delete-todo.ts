// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { todo } from "./component.todo.js";

/** Deletes a todo. */
export const deleteTodo: System<{ readonly entity: Entity }> = System.create({
    target: "entity",
    components: { with: [todo] },
}, (row, { commands }, _input: { readonly entity: Entity }) => {
    commands.despawn(row.entity);
});
