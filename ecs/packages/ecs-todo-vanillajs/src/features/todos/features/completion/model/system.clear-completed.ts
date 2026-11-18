// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { byDoneInOrder } from "../../../model/index.js";

/** Deletes the todos that are done. */
export const clearCompleted: System = System.create({
    lookup: { byDone: { index: byDoneInOrder } },
}, ({ lookup, commands }) => {
    const completed = lookup.byDone(true);
    for (let i = 0; i < completed.length; i++) commands.despawn(completed.at(i).entity);
});
