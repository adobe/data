// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { label } from "./component.label.js";
import { todo } from "./component.todo.js";

/** Gives a todo a new label, trimmed; a blank one deletes it. */
export const editTodo: System<{ readonly entity: Entity; readonly label: string }> = System.create({
    target: "entity",
    components: { with: [label, todo] },
}, (row, { commands }, input: { readonly entity: Entity; readonly label: string }) => {
    const trimmed = input.label.trim();
    if (trimmed === "") commands.despawn(row.entity);
    else row[label] = trimmed;
});
