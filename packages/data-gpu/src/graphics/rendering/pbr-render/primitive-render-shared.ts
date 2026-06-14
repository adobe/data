// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";

/** Must match `pbrIblRender` IBL bake mip count. */
export const PREFILTERED_MIP_COUNT = 7;

/** Drawable: visible entity with mesh ref, transform, and material. */
export const DRAWABLE = ["mesh", "visible", "position", "rotation", "scale", "material"] as const;
export const DRAWABLE_INTERP = [...DRAWABLE, "_renderPosition", "_renderRotation"] as const;
export const DRAWABLE_DIRECT = { exclude: ["_renderPosition"] } as const;
export const PRIMITIVE = ["_vertexBuffer", "_indexBuffer", "_indexCount", "_indexFormat", "_mesh", "_nodeLocalMatrix"] as const;

/** Minimal column shape the gather reads — satisfied by either query's columns. */
export interface ColumnReader<T> { get(i: number): T }

export function createIblBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    return device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "cube" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "cube" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ],
    });
}

/** Compose column-major TRS into `out[o..o+15]`. */
export function composeTrs(
    out: Float32Array, o: number,
    p: ArrayLike<number>, pi: number, q: ArrayLike<number>, qi: number, s: ArrayLike<number>, si: number,
): void {
    const qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
    const sx = s[si], sy = s[si + 1], sz = s[si + 2];
    const xx = qx * qx, yy = qy * qy, zz = qz * qz;
    const xy = qx * qy, xz = qx * qz, yz = qy * qz;
    const wx = qw * qx, wy = qw * qy, wz = qw * qz;
    out[o] = (1 - 2 * (yy + zz)) * sx; out[o + 1] = (2 * (xy + wz)) * sx; out[o + 2] = (2 * (xz - wy)) * sx; out[o + 3] = 0;
    out[o + 4] = (2 * (xy - wz)) * sy; out[o + 5] = (1 - 2 * (xx + zz)) * sy; out[o + 6] = (2 * (yz + wx)) * sy; out[o + 7] = 0;
    out[o + 8] = (2 * (xz + wy)) * sz; out[o + 9] = (2 * (yz - wx)) * sz; out[o + 10] = (1 - 2 * (xx + yy)) * sz; out[o + 11] = 0;
    out[o + 12] = p[pi]; out[o + 13] = p[pi + 1]; out[o + 14] = p[pi + 2]; out[o + 15] = 1;
}

export interface MeshBatch {
    off: number[];
    materialIndex: number[];
}

/** @deprecated Use `MeshBatch`. */
export type GeometryBatch = MeshBatch;

export interface InstancedDrawCache {
    buffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
    capacity: number;
}

/** Refresh material entity → GPU index map when the tagged material set grows. */
export function refreshMaterialIndexMap(
    db: { store: { queryArchetypes: (cols: string[]) => Iterable<{ rowCount: number; columns: { id: ColumnReader<Entity>; [k: string]: ColumnReader<number> } }> } },
    indexColumn: string,
    matCount: { value: number },
    matIndex: Map<Entity, number>,
): void {
    let mc = 0;
    for (const arch of db.store.queryArchetypes([indexColumn])) mc += arch.rowCount;
    if (mc === matCount.value) return;
    matIndex.clear();
    for (const arch of db.store.queryArchetypes([indexColumn])) {
        const id = arch.columns.id;
        const col = arch.columns[indexColumn];
        for (let i = 0; i < arch.rowCount; i++) matIndex.set(id.get(i), col.get(i));
    }
    matCount.value = mc;
}
