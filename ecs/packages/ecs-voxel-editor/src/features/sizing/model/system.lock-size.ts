// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { model, sizeUnlocked } from "../../voxels/model/index.js";

/** Locks a model's size, so editing stops at its bounds, or unlocks it, so editing past them grows it. */
export const lockSize: System<{ readonly model: Entity; readonly locked: boolean }> = System.create({
    lookup: { models: { with: [model], optional: [sizeUnlocked] } },
}, ({ lookup, commands }, input: { readonly model: Entity; readonly locked: boolean }) => {
    const row = lookup.models(input.model);
    if (row === null) return;
    const unlocked = row[sizeUnlocked] === true;
    if (input.locked && unlocked) commands.remove(input.model, sizeUnlocked);
    else if (!input.locked && !unlocked) commands.add(input.model, sizeUnlocked, true);
});
