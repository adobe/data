// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../../../index.js";
import { done, todo } from "../todos/data.js";
import { byDone } from "./data.js";

/** Marks every todo done, or every one not done. Only todos that change are written. */
export const toggleAll = System.create({
    name: "completion/toggleAll",
    components: { write: [done], has: [todo] },
}, (row, _context, input: { readonly done: boolean }) => {
    if (row[done] !== input.done) row[done] = input.done;
});

/** Deletes the todos that are done. */
export const clearCompleted = System.create({
    name: "completion/clearCompleted",
    lookup: { byDone: { index: byDone } },
}, ({ lookup, commands }) => {
    const completed = lookup.byDone(true);
    for (let i = 0; i < completed.length; i++) commands.despawn(completed.at(i).entity);
});
