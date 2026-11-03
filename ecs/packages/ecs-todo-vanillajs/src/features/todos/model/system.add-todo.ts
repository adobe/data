// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { Todo } from "./archetype.todo.js";
import { done } from "./component.done.js";
import { label } from "./component.label.js";
import { order } from "./component.order.js";
import { orderAfter } from "./function.order-after.js";
import { ordered } from "./index.ordered.js";

/** Adds a todo at the end of the list, with its label trimmed; a blank label adds nothing. */
export const addTodo: System<{ readonly label: string }> = System.create({
    lookup: { ordered: { index: ordered } },
}, ({ lookup, commands }, input: { readonly label: string }) => {
    const trimmed = input.label.trim();
    if (trimmed === "") return;
    commands.spawn(Todo)({ [label]: trimmed, [done]: false, [order]: orderAfter(lookup.ordered()) });
});
