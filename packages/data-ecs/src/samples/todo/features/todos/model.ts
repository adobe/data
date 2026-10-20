import { Entity, System } from "../../../../index.js";
import { Todo, done, label, order, ordered, todo } from "./data.js";

const text = { type: "string" } as const;

/** Adds a todo at the end of the list, with its label trimmed; a blank label adds nothing. */
export const addTodo = System.create({
    name: "todos/add",
    input: { type: "object", properties: { label: text } },
    lookup: { ordered: { index: ordered, read: [order] } },
}, ({ input, lookup, commands }) => {
    const trimmed = input.label.trim();
    if (trimmed === "") return;
    const all = lookup.ordered();
    const next = all.length === 0 ? 0 : all.at(all.length - 1)[order] + 1;
    commands.spawn(Todo)({ [todo]: true, [label]: trimmed, [done]: false, [order]: next });
});

export const toggleTodo = System.create({
    name: "todos/toggle",
    input: { type: "object", properties: { entity: Entity.schema } },
    lookup: { todos: { read: [done], has: [todo] } },
}, ({ input, lookup, commands }) => {
    const found = lookup.todos(input.entity);
    if (found !== null) commands.add(input.entity, done, !found[done]);
});

/** Gives a todo a new label, trimmed; a blank one deletes it. */
export const editTodo = System.create({
    name: "todos/edit",
    input: { type: "object", properties: { entity: Entity.schema, label: text } },
    lookup: { todos: { has: [todo] } },
}, ({ input, lookup, commands }) => {
    if (lookup.todos(input.entity) === null) return;
    const trimmed = input.label.trim();
    if (trimmed === "") commands.despawn(input.entity);
    else commands.add(input.entity, label, trimmed);
});

export const deleteTodo = System.create({
    name: "todos/delete",
    input: { type: "object", properties: { entity: Entity.schema } },
    lookup: { todos: { has: [todo] } },
}, ({ input, lookup, commands }) => {
    if (lookup.todos(input.entity) !== null) commands.despawn(input.entity);
});

/**
 * Moves a todo to just before `before`, or to the end for `Entity.none`, by giving it an order between its new
 * neighbours'. When no number lies between them, every todo is numbered again.
 */
export const moveTodo = System.create({
    name: "todos/move",
    input: { type: "object", properties: { entity: Entity.schema, before: Entity.schema } },
    lookup: { todos: { read: [order], has: [todo] }, ordered: { index: ordered, read: [order] } },
}, ({ input, lookup, commands }) => {
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
