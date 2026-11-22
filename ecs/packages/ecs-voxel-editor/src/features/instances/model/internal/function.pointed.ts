// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Vec3 } from "@adobe/ecs";
import { type Camera, rayThrough } from "../../../camera/model/index.js";
import { editFrame, type Editing, editingOf, type Lookups } from "../../../voxels/model/index.js";
import { instanceAt } from "./function.instance-at.js";
import type { Pointer } from "./type.pointer.js";

/** The instance under the pointer, placed directly in the model being edited, with the editing it's entered from; null for none. */
export const pointed = (
    camera: Camera,
    pointer: Pointer,
    current: Editing | null,
    main: Entity,
    lookups: Lookups & { readonly instancesIn: (model: Entity) => readonly Entity[]; readonly filled: (model: Entity, cell: Vec3) => boolean },
): { readonly instance: Entity; readonly editing: Editing } | null => {
    const frame = editFrame(current, main, lookups);
    if (frame === null) return null;
    const found = instanceAt(rayThrough(camera, pointer.x, pointer.y, pointer.aspect), frame, lookups);
    if (found === null) return null;
    return { instance: found, editing: current ?? editingOf(main, [], main) };
};
