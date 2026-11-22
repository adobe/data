// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, type Vec3 } from "@adobe/ecs";
import { camera, type Ray } from "../../camera/model/index.js";
import { editFrame, editing, Instance, lookupsOf, mainModel, model, parent, scale, size, sizeUnlocked, voxelAt } from "../../voxels/model/index.js";
import { SelectedFace } from "./archetype.selected-face.js";
import { faceCell } from "./component.face-cell.js";
import { faceSide } from "./component.face-side.js";
import { normalOf } from "./function.normal-of.js";
import { faceAt } from "./internal/index.face-at.js";
import { keyOf } from "./internal/function.key-of.js";
import { pick } from "./internal/function.pick.js";
import { drag } from "./internal/resource.drag.js";
import type { Pointer } from "./internal/type.pointer.js";
import type { Face } from "./internal/type.face.js";

/**
 * Extends the selecting drag to where the pointer is, by the keys held now, so the drag changes shape as they're pressed
 * and released: with `ctrl` the faces in a rectangle, and with `shift` in a straight line, from the first face to the
 * point under the pointer in its plane; with neither, every face the pointer has passed over. Faces the last move
 * covered that this one doesn't are put back.
 */
export const dragSelect: System<Move> = System.create({
    lookup: { models: { with: [model, size, scale], optional: [sizeUnlocked] }, instances: { with: [...Instance] }, voxelAt: { index: voxelAt }, faceAt: { index: faceAt } },
}, ({ lookup, resources, commands }, input: Move) => {
    const current = resources[drag];
    if (current === null) return;
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    // A drag lasts while the model it began in is the one edited.
    if (frame === null || frame.model !== current.model) return;
    const bounds = frame.size;
    const { ray, hit } = pick(resources[camera], input, frame, (holder, cell) => lookup.voxelAt(holder, cell) !== null);
    const painted = hit === null || current.painted.has(keyOf(hit)) ? current.painted : new Map([...current.painted, [keyOf(hit), hit]]);
    const shape = input.ctrl ? "rect" : input.shift ? "line" : "paint";
    // A locked model's line or rectangle stops at its bounds; an unlocked one's runs past them, as its model grows.
    const end = shape === "paint" ? null : planeCell(ray, current.anchor, lookup.models(frame.model)?.[sizeUnlocked] === true ? null : bounds);
    // A line or rectangle whose plane the ray doesn't cross keeps what it covered.
    if (shape !== "paint" && end === null) {
        if (painted !== current.painted) resources[drag] = { ...current, painted };
        return;
    }
    const chosen = end === null ? painted : shapeOf(current.anchor, shape === "line", end);
    const set = (target: Face, selected: boolean): void => {
        const existing = lookup.faceAt(frame.model, target.cell, target.side);
        if (selected && existing.length === 0) commands.spawn(SelectedFace)({ [parent]: frame.model, [faceCell]: target.cell, [faceSide]: target.side });
        else if (!selected) for (let i = 0; i < existing.length; i++) commands.despawn(existing.at(i).entity);
    };
    const changed = new Map<string, Face>();
    for (const [key, face] of current.changed) {
        if (chosen.has(key)) changed.set(key, face);
        else set(face, !current.select);
    }
    for (const [key, target] of chosen) {
        if (changed.has(key) || (lookup.faceAt(frame.model, target.cell, target.side).length > 0) === current.select) continue;
        set(target, current.select);
        changed.set(key, target);
    }
    if (painted !== current.painted || !sameKeys(changed, current.changed)) resources[drag] = { ...current, painted, changed };
});

/** Whether two maps hold the same keys. */
const sameKeys = (a: ReadonlyMap<string, unknown>, b: ReadonlyMap<string, unknown>): boolean => {
    if (a.size !== b.size) return false;
    for (const key of a.keys()) if (!b.has(key)) return false;
    return true;
};

/** Where the pointer is, as `Pointer` has it, and whether Shift and Ctrl, or ⌘, are held. */
type Move = { readonly x: number; readonly y: number; readonly aspect: number; readonly shift: boolean; readonly ctrl: boolean };

/**
 * The cell, in the plane of `anchor`'s cell, whose face the ray crosses `anchor`'s plane at, kept within `bounds`
 * across it, or anywhere for null; null for a ray that doesn't cross it.
 */
const planeCell = (ray: Ray, anchor: Face, bounds: Vec3 | null): Vec3.I32 | null => {
    const axis = anchor.side >> 1;
    const normal = normalOf(anchor.side);
    const plane = anchor.cell[axis] + (normal[axis] > 0 ? 1 : 0);
    const d = ray.direction[axis];
    if (Math.abs(d) < 1e-9) return null;
    const t = (plane - ray.origin[axis]) / d;
    if (t < 0) return null;
    const cell: [number, number, number] = [0, 0, 0];
    for (let other = 0; other < 3; other++) {
        const across = Math.floor(ray.origin[other] + ray.direction[other] * t);
        cell[other] = other === axis ? anchor.cell[axis] : bounds === null ? across : Math.min(Math.max(across, 0), bounds[other] - 1);
    }
    return cell;
};

/** The faces a line, or else a rectangle, covers from `anchor` to `end`, by key. */
const shapeOf = (anchor: Face, line: boolean, end: Vec3.I32): Map<string, Face> => {
    const axis = anchor.side >> 1;
    const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
    const start = anchor.cell;
    let [u0, u1, v0, v1] = [start[u], end[u], start[v], end[v]];
    // A line runs along the axis the pointer moved furthest along.
    if (line) {
        if (Math.abs(u1 - u0) >= Math.abs(v1 - v0)) v1 = v0;
        else u1 = u0;
    }
    if (u0 > u1) [u0, u1] = [u1, u0];
    if (v0 > v1) [v0, v1] = [v1, v0];
    const chosen = new Map<string, Face>();
    for (let i = u0; i <= u1; i++) {
        for (let j = v0; j <= v1; j++) {
            const cell: [number, number, number] = [start[0], start[1], start[2]];
            cell[u] = i;
            cell[v] = j;
            const covered = { cell, side: anchor.side };
            chosen.set(keyOf(covered), covered);
        }
    }
    return chosen;
};
