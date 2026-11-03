// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { done, todo } from "../../todos/model/index.js";

/** Marks every todo done, or every one not done. Only todos that change are written. */
export const toggleAll: System<{ readonly done: boolean }> = System.create({
    components: { with: [done, todo] },
}, (row, _context, input: { readonly done: boolean }) => {
    if (row[done] !== input.done) row[done] = input.done;
});
