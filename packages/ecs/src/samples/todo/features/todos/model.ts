// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System } from "../../../../index.js";
import { Todo, done, label, order, orderAfter, ordered, todo } from "./data.js";

/** Adds a todo at the end of the list, with its label trimmed; a blank label adds nothing. */
export const addTodo = System.create({
    lookup: { ordered: { index: ordered, read: [order] } },
}, ({ lookup, commands }, input: { readonly label: string }) => {
    const trimmed = input.label.trim();
    if (trimmed === "") return;
    commands.spawn(Todo)({ [label]: trimmed, [done]: false, [order]: orderAfter(lookup.ordered()) });
});

/** The todo a system on one acts on. */
type One = { readonly entity: Entity };

export const toggleTodo = System.create({
    target: "entity",
    components: { write: [done], has: [todo] },
}, (row, _context, _input: One) => {
    row[done] = !row[done];
});

/** Gives a todo a new label, trimmed; a blank one deletes it. */
export const editTodo = System.create({
    target: "entity",
    components: { write: [label], has: [todo] },
}, (row, { commands }, input: One & { readonly label: string }) => {
    const trimmed = input.label.trim();
    if (trimmed === "") commands.despawn(row.entity);
    else row[label] = trimmed;
});

export const deleteTodo = System.create({
    target: "entity",
    components: { has: [todo] },
}, (row, { commands }, _input: One) => {
    commands.despawn(row.entity);
});

/**
 * Moves a todo to just before `before`, or to the end for `Entity.none`, by giving it an order between its new
 * neighbours'. When no number lies between them, every todo is numbered again.
 */
export const moveTodo = System.create({
    lookup: { todos: { read: [order], has: [todo] }, ordered: { index: ordered, read: [order] } },
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
