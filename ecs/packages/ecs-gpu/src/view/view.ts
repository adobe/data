// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Finalizer, type Mat4x4, type Vec4 } from "@adobe/ecs";
import { perDevice } from "../cache/cache.js";
import * as Target from "../target/public.js";

/**
 * A view's place on its target's device: the target, its rectangle in the target in pixels (`x`, `y`, `width`,
 * `height`), and the uniform buffer and bind group holding its projection and size, for `wgsl`'s declarations.
 */
export type State = {
    readonly entity: Entity;
    readonly target: Target.State;
    readonly rectangle: readonly [number, number, number, number];
    readonly projection: Mat4x4;
    readonly buffer: GPUBuffer;
    readonly bindGroup: GPUBindGroup;
};

/**
 * An entity with these is a view: the render target it draws into, which owns it; its rectangle in that target as
 * fractions of its size (`x`, `y`, `width`, `height`); and the matrix taking its scene to clip space.
 */
export const target = Symbol("View.target");
export const viewport = Symbol("View.viewport");
export const projection = Symbol("View.projection");
/** Each view's state on the world's device, by its entity: null until views are first updated. */
export const states = Symbol("View.states");

declare module "@adobe/ecs" {
    interface Components {
        [target]: { type: Entity; reference: "owner" };
        [viewport]: { type: Vec4; default: [0, 0, 1, 1] };
        [projection]: { type: Mat4x4 };
    }
    interface Resources {
        [states]: { type: ReadonlyMap<Entity, State> | null };
    }
}

/** The uniform each view binds: its projection, then its size in pixels. */
const uniformBytes = 80;

const layouts = perDevice((device: GPUDevice, _key: null) => device.createBindGroupLayout({
    label: "view",
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }],
}), () => "");

/** The bind group layout of a view's uniform, one per device: a pipeline's layout takes it at the group `wgsl` names. */
export const layout = (device: GPUDevice): GPUBindGroupLayout => layouts(device, null);

/** The WGSL declarations of a view's uniform at bind group `group`: `view.projection` and `view.size`, in pixels. */
export const wgsl = (group: number): string =>
    `struct View { projection: mat4x4f, size: vec2f }\n@group(${group}) @binding(0) var<uniform> view: View;\n`;

const rectangleOf = ([x, y, width, height]: Vec4, [targetWidth, targetHeight]: readonly [number, number]): readonly [number, number, number, number] => {
    const left = Math.min(targetWidth - 1, Math.max(0, Math.round(x * targetWidth)));
    const top = Math.min(targetHeight - 1, Math.max(0, Math.round(y * targetHeight)));
    return [left, top, Math.max(1, Math.min(targetWidth - left, Math.round(width * targetWidth))), Math.max(1, Math.min(targetHeight - top, Math.round(height * targetHeight)))];
};

const sameRectangle = (a: readonly number[], b: readonly number[]): boolean => a.every((value, index) => value === b[index]);
const sameMatrix = (a: Mat4x4, b: Mat4x4): boolean => a.every((value, index) => value === b[index]);

/** A view as an index lists it: its entity, target, viewport and projection. */
export type Listed = { readonly entity: Entity; readonly [target]: Entity; readonly [viewport]: Vec4; readonly [projection]: Mat4x4 };

/**
 * Each view placed in its target, its uniform written where its projection or rectangle changed; a view whose target
 * has no textures, as without a device, has no state. Gives `previous` itself when nothing changed.
 */
export const updated = (device: GPUDevice | null, targets: ReadonlyMap<Entity, Target.State>, previous: ReadonlyMap<Entity, State> | null, views: { readonly length: number; at(index: number): Listed }): ReadonlyMap<Entity, State> => {
    const held = previous ?? new Map<Entity, State>();
    let next: Map<Entity, State> | null = null;
    for (let i = 0; i < views.length; i++) {
        const view = views.at(i);
        const old = held.get(view.entity);
        const drawn = device === null ? undefined : targets.get(view[target]);
        if (device === null || drawn === undefined) {
            if (old === undefined) continue;
            old.buffer.destroy();
            next ??= new Map(held);
            next.delete(view.entity);
            continue;
        }
        const rectangle = rectangleOf(view[viewport], drawn.size);
        const matrix = view[projection];
        if (old !== undefined && old.target === drawn && sameRectangle(old.rectangle, rectangle) && sameMatrix(old.projection, matrix)) continue;
        const kept = old !== undefined && old.target.device === device;
        if (old !== undefined && !kept) old.buffer.destroy();
        const buffer = kept ? old.buffer : device.createBuffer({ label: `view ${view.entity}`, size: uniformBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bindGroup = kept ? old.bindGroup : device.createBindGroup({ layout: layout(device), entries: [{ binding: 0, resource: { buffer } }] });
        device.queue.writeBuffer(buffer, 0, new Float32Array([...matrix, rectangle[2], rectangle[3], 0, 0]));
        next ??= new Map(held);
        next.set(view.entity, { entity: view.entity, target: drawn, rectangle, projection: matrix, buffer, bindGroup });
    }
    return next ?? held;
};

/** Destroys a view's uniform buffer when it stops being one. */
export const release = Finalizer.create({ components: { with: [target, viewport, projection] } }, (view, { resources }) => {
    const current = resources[states];
    const state = current?.get(view.entity);
    if (current === null || state === undefined) return;
    state.buffer.destroy();
    const next = new Map(current);
    next.delete(view.entity);
    resources[states] = next;
});

/**
 * Begins a render pass drawing into a view: its target's textures, loading what they hold, limited to its rectangle,
 * multisampled passes resolving into the target's color.
 */
export const begin = (encoder: GPUCommandEncoder, view: State, label?: string): GPURenderPassEncoder => {
    const { color, multisampled, depth } = view.target;
    const pass = encoder.beginRenderPass({
        label,
        colorAttachments: [{ view: (multisampled ?? color).createView(), resolveTarget: multisampled === null ? undefined : color.createView(), loadOp: "load", storeOp: "store" }],
        depthStencilAttachment: depth === null ? undefined : { view: depth.createView(), depthLoadOp: "load", depthStoreOp: "store" },
    });
    const [x, y, width, height] = view.rectangle;
    pass.setViewport(x, y, width, height, 0, 1);
    pass.setScissorRect(x, y, width, height);
    return pass;
};
