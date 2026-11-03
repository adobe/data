// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { byDone } from "./index.by-done.js";

/** Deletes the todos that are done. */
export const clearCompleted: System = System.create({
    lookup: { byDone: { index: byDone } },
}, ({ lookup, commands }) => {
    const completed = lookup.byDone(true);
    for (let i = 0; i < completed.length; i++) commands.despawn(completed.at(i).entity);
});
