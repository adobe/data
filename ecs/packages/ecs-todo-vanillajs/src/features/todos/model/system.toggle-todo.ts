// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { done } from "./persistent.component.done.js";
import { todo } from "./persistent.component.todo.js";

/** Marks a todo done, or not done. */
export const toggleTodo: System<{ readonly entity: Entity }> = System.create({
    target: "entity",
    components: { with: [done, todo] },
}, (row, _context, _input: { readonly entity: Entity }) => {
    row[done] = !row[done];
});
