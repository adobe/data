// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System } from "@adobe/ecs";
import { order } from "./component.order.js";
import { todo } from "./component.todo.js";
import { ordered } from "./index.ordered.js";

/**
 * Moves a todo to just before `before`, or to the end for `Entity.none`, by giving it an order between its new
 * neighbours'. When no number lies between them, every todo is numbered again.
 */
export const moveTodo: System<{ readonly entity: Entity; readonly before: Entity }> = System.create({
    lookup: { todos: { with: [order, todo] }, ordered: { index: ordered } },
}, ({ lookup, commands }, input: { readonly entity: Entity; readonly before: Entity }) => {
    const { entity, before } = input;
    if (entity === before || lookup.todos(entity) === null) return;
    const next = before === Entity.none ? null : lookup.todos(before);
    if (before !== Entity.none && next === null) return;
    const earlier = next === null ? lookup.ordered() : lookup.ordered({ "<": next[order] });
    if (earlier.length > 0 && earlier.at(earlier.length - 1).entity === entity) return;
    const low = earlier.length === 0 ? (next === null ? 0 : next[order] - 1) : earlier.at(earlier.length - 1)[order];
    const high = next === null ? low + 2 : next[order];
    const middle = (low + high) / 2;
    if (middle > low && middle < high) {
        commands.add(entity, order, middle);
        return;
    }
    const all = lookup.ordered();
    let position = 0;
    for (let i = 0; i < all.length; i++) {
        const row = all.at(i);
        if (row.entity === entity) continue;
        if (row.entity === before) commands.add(entity, order, position++);
        commands.add(row.entity, order, position++);
    }
    if (next === null) commands.add(entity, order, position);
});
