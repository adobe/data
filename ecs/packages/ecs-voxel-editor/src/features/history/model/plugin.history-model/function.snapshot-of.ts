// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import type { Snapshot } from "../internal/type.snapshot.js";

/** A list as an index lookup gives one. */
type List<T> = { readonly length: number; readonly at: (index: number) => T };

/** A snapshot of the document's model sizes, voxels, instances and selected faces, its keys sorted so the order they're listed in doesn't matter. */
export const snapshotOf = (main: Entity, lists: {
    readonly models: List<{ readonly model: Entity; readonly size: ArrayLike<number> }>;
    readonly voxels: List<{ readonly cell: ArrayLike<number>; readonly material: Entity; readonly paint: Entity; readonly painted: number; readonly parent: Entity }>;
    readonly instances: List<{ readonly of: Entity; readonly parent: Entity; readonly position: ArrayLike<number>; readonly rotation: ArrayLike<number> }>;
    readonly faces: List<{ readonly parent: Entity; readonly cell: ArrayLike<number>; readonly side: number }>;
}): Snapshot => {
    const three = (values: ArrayLike<number>): readonly [number, number, number] => [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
    const sizes: Snapshot["sizes"][number][] = [];
    for (let i = 0; i < lists.models.length; i++) {
        const { model, size } = lists.models.at(i);
        sizes.push({ model, size: three(size) });
    }
    const voxels: Snapshot["voxels"][number][] = [];
    for (let i = 0; i < lists.voxels.length; i++) {
        const { cell, material, paint, painted, parent } = lists.voxels.at(i);
        voxels.push({ cell: three(cell), material, paint, painted, parent });
    }
    const instances: Snapshot["instances"][number][] = [];
    for (let i = 0; i < lists.instances.length; i++) {
        const { of, parent, position, rotation } = lists.instances.at(i);
        instances.push({ of, parent, position: three(position), rotation: [rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0, rotation[3] ?? 1] });
    }
    const faces: Snapshot["faces"][number][] = [];
    for (let i = 0; i < lists.faces.length; i++) {
        const { parent, cell, side } = lists.faces.at(i);
        faces.push({ parent, cell: three(cell), side });
    }
    const contentKey = [
        ...sizes.map(row => `m${row.model}:${row.size.join(",")}`),
        ...voxels.map(row => `v${row.parent}:${row.cell.join(",")}:${row.material}:${row.paint}:${row.painted}`),
        ...instances.map(row => `i${row.parent}:${row.of}:${row.position.join(",")}:${row.rotation.join(",")}`),
    ].sort().join(";");
    return { main, sizes, voxels, instances, faces, contentKey, faceKey: faces.map(row => `${row.parent}:${row.cell.join(",")}:${row.side}`).sort().join(";") };
};
