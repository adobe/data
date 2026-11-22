// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Cache } from "@adobe/ecs-gpu";
import type { DrawList } from "./type.draw-list.js";

/**
 * The scene's bind groups on `device`, written from the `scene`, `drawList` and `materialTable` resources as they
 * change: group 2, its uniform, `scene`, and the material table, `materials`; and group 3, each draw's matrix, at a
 * dynamic offset of `stride` bytes per draw. With their layouts, and an empty group for group 0 of pipelines drawing
 * nothing of the world's tables.
 */
export const sceneBinding = (device: GPUDevice, scene: Scene | null, list: DrawList | null, table: Table | null): Binding => {
    const made = bindings(device, null);
    if (scene !== null && list !== null && (scene !== made.scene || list !== made.list)) {
        const values = new Float32Array(40);
        values.set(scene.inverseViewProjection, 0);
        values.set(scene.eye, 16);
        values.set(list.edit.toWorld, 20);
        values.set(list.edit.size, 36);
        device.queue.writeBuffer(made.uniform, 0, values);
    }
    if (list !== null && list !== made.list) {
        const bytes = Math.max(stride, list.draws.length * stride);
        if (bytes > made.placements.size) {
            made.placements.destroy();
            made.placements = device.createBuffer({ size: bytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            made.placementGroup = device.createBindGroup({ layout: made.placementLayout, entries: [{ binding: 0, resource: { buffer: made.placements, size: 64 } }] });
        }
        const values = new Float32Array(bytes / 4);
        list.draws.forEach((draw, i) => values.set(draw.toWorld, i * stride / 4));
        device.queue.writeBuffer(made.placements, 0, values);
    }
    made.scene = scene;
    made.list = list;
    if (table !== null && table !== made.table) {
        made.table = table;
        const bytes = Math.max(32, table.values.length * 4);
        if (bytes > made.materials.size) {
            made.materials.destroy();
            made.materials = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            made.group = device.createBindGroup({ layout: made.layout, entries: [{ binding: 0, resource: { buffer: made.uniform } }, { binding: 1, resource: { buffer: made.materials } }] });
        }
        device.queue.writeBuffer(made.materials, 0, new Float32Array(table.values));
    }
    return made;
};

/** The bytes between draws' matrices, the least alignment of a dynamic uniform offset. */
const stride = 256;

/** What the sky's shader knows, as the `scene` resource holds it. */
type Scene = { readonly inverseViewProjection: Iterable<number> & ArrayLike<number>; readonly eye: Iterable<number> & ArrayLike<number> };
/** The material table, as the `materialTable` resource holds it. */
type Table = { readonly values: readonly number[] };

/** A device's scene bindings, and what they last wrote. */
type Binding = {
    readonly stride: number;
    readonly layout: GPUBindGroupLayout;
    readonly placementLayout: GPUBindGroupLayout;
    readonly empty: GPUBindGroupLayout;
    readonly emptyGroup: GPUBindGroup;
    readonly uniform: GPUBuffer;
    materials: GPUBuffer;
    placements: GPUBuffer;
    group: GPUBindGroup;
    placementGroup: GPUBindGroup;
    scene: Scene | null;
    list: DrawList | null;
    table: Table | null;
};

const bindings = Cache.perDevice((device: GPUDevice): Binding => {
    const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    const layout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility, buffer: { type: "uniform" } },
            { binding: 1, visibility, buffer: { type: "read-only-storage" } },
        ],
    });
    const placementLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility, buffer: { type: "uniform", hasDynamicOffset: true } }] });
    const empty = device.createBindGroupLayout({ entries: [] });
    const uniform = device.createBuffer({ size: 40 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const materials = device.createBuffer({ size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const placements = device.createBuffer({ size: stride, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    return {
        stride, layout, placementLayout, empty, emptyGroup: device.createBindGroup({ layout: empty, entries: [] }),
        uniform, materials, placements,
        group: device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: materials } }] }),
        placementGroup: device.createBindGroup({ layout: placementLayout, entries: [{ binding: 0, resource: { buffer: placements, size: 64 } }] }),
        scene: null, list: null, table: null,
    };
});
