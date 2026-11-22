// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, type Vec3 } from "@adobe/ecs";
import { camera } from "../../camera/model/index.js";
import { editFrame, editing, Instance, lookupsOf, mainModel, model, parent, scale, size, voxelAt } from "../../voxels/model/index.js";
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
 * Selects every face connected to the one under the pointer, or deselects them where it's selected: those in its
 * plane, facing its way, reached across their edges through faces filled behind and open in front as it is.
 */
export const selectConnected: System<Pointer> = System.create({
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] }, voxelAt: { index: voxelAt }, faceAt: { index: faceAt } },
}, ({ lookup, resources, commands }, input: Pointer) => {
    if (resources[drag] !== null) resources[drag] = null;
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    if (frame === null) return;
    const bounds = frame.size;
    const { filled, hit } = pick(resources[camera], input, frame, (holder, cell) => lookup.voxelAt(holder, cell) !== null);
    if (hit === null) return;
    const select = lookup.faceAt(frame.model, hit.cell, hit.side).length === 0;
    for (const each of connected(hit, bounds, filled)) {
        const existing = lookup.faceAt(frame.model, each.cell, each.side);
        if (select && existing.length === 0) commands.spawn(SelectedFace)({ [parent]: frame.model, [faceCell]: each.cell, [faceSide]: each.side });
        else if (!select) for (let i = 0; i < existing.length; i++) commands.despawn(existing.at(i).entity);
    }
});

/** The faces connected to `start`, `start` among them. */
const connected = (start: Face, bounds: Vec3, filled: (x: number, y: number, z: number) => boolean): Face[] => {
    const axis = start.side >> 1;
    const normal = normalOf(start.side);
    const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
    const kind = (cell: Vec3.I32): number =>
        (filled(cell[0], cell[1], cell[2]) ? 1 : 0) + (filled(cell[0] + normal[0], cell[1] + normal[1], cell[2] + normal[2]) ? 2 : 0);
    const like = kind(start.cell);
    const found: Face[] = [];
    const seen = new Set<string>([keyOf(start)]);
    const queue: Face[] = [start];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        found.push(next);
        for (const [du, dv] of steps) {
            const cell: [number, number, number] = [next.cell[0], next.cell[1], next.cell[2]];
            cell[u] += du;
            cell[v] += dv;
            if (cell[u] < 0 || cell[u] >= bounds[u] || cell[v] < 0 || cell[v] >= bounds[v]) continue;
            const neighbour = { cell, side: start.side };
            const key = keyOf(neighbour);
            if (seen.has(key) || kind(cell) !== like) continue;
            seen.add(key);
            queue.push(neighbour);
        }
    }
    return found;
};

/** The steps to a face's four neighbours in its plane. */
const steps: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
