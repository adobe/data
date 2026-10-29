// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Finalizer, System, type Vec2, type Vec4 } from "@adobe/ecs";

/**
 * What a render target draws into: its color format, null for the platform's preferred canvas format; its samples per
 * pixel, more than one drawing multisampled and resolving into its color; its depth format, null for none; and the
 * color it's cleared to each frame, null to keep what it holds.
 */
export type Options = {
    readonly format: GPUTextureFormat | null;
    readonly sampleCount: 1 | 4;
    readonly depthFormat: GPUTextureFormat | null;
    readonly clear: Vec4 | null;
};

export const Options = {
    default: { format: null, sampleCount: 1, depthFormat: "depth24plus", clear: [0, 0, 0, 1] },
} as const;

/**
 * A target's textures on the world's device. `color` holds what's drawn, single-sampled, for reading and presenting;
 * with more than one sample, passes draw into `multisampled` and resolve into `color`. `size` is in pixels.
 */
export type State = {
    readonly entity: Entity;
    readonly device: GPUDevice;
    readonly options: Options;
    readonly format: GPUTextureFormat;
    readonly size: Vec2.U32;
    readonly color: GPUTexture;
    readonly multisampled: GPUTexture | null;
    readonly depth: GPUTexture | null;
};

/** An entity with these is a render target: what its textures are, and their size in pixels. */
export const options = Symbol("Target.options");
export const size = Symbol("Target.size");
/** Each render target's textures on the world's device, by its entity: null until targets are first updated. */
export const states = Symbol("Target.states");

declare module "@adobe/ecs" {
    interface Components {
        [options]: { type: Options };
        [size]: { type: Vec2.U32 };
    }
    interface Resources {
        [states]: { type: ReadonlyMap<Entity, State> | null };
    }
}

const sameOptions = (a: Options, b: Options): boolean =>
    a.format === b.format && a.sampleCount === b.sampleCount && a.depthFormat === b.depthFormat
    && (a.clear === b.clear || (a.clear !== null && b.clear !== null && a.clear.every((value, index) => value === b.clear?.[index])));

const destroyTextures = (state: State): void => {
    state.color.destroy();
    state.multisampled?.destroy();
    state.depth?.destroy();
};

const created = (device: GPUDevice, entity: Entity, declared: Options, [width, height]: Vec2.U32): State => {
    const format = declared.format ?? navigator.gpu.getPreferredCanvasFormat();
    const extent = [width, height];
    const color = device.createTexture({
        label: `target ${entity} color`, size: extent, format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
    });
    const multisampled = declared.sampleCount === 1 ? null : device.createTexture({
        label: `target ${entity} multisampled`, size: extent, format, sampleCount: declared.sampleCount, usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depth = declared.depthFormat === null ? null : device.createTexture({
        label: `target ${entity} depth`, size: extent, format: declared.depthFormat, sampleCount: declared.sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return { entity, device, options: declared, format, size: [width, height], color, multisampled, depth };
};

/** A render target as an index lists it: its entity, options and size. */
export type Listed = { readonly entity: Entity; readonly [options]: Options; readonly [size]: Vec2.U32 };

/**
 * Each render target's textures on `device`, made again where its options, its size or the device changed, destroying
 * those they replace; with no device, none. Gives `previous` itself when nothing changed.
 */
export const updated = (device: GPUDevice | null, previous: ReadonlyMap<Entity, State> | null, targets: { readonly length: number; at(index: number): Listed }): ReadonlyMap<Entity, State> => {
    const held = previous ?? new Map<Entity, State>();
    let next: Map<Entity, State> | null = null;
    for (let i = 0; i < targets.length; i++) {
        const target = targets.at(i);
        const old = held.get(target.entity);
        const [width, height] = target[size];
        if (device !== null && old !== undefined && old.device === device && old.size[0] === width && old.size[1] === height && sameOptions(old.options, target[options])) continue;
        if (device === null && old === undefined) continue;
        next ??= new Map(held);
        if (old !== undefined) destroyTextures(old);
        if (device === null) next.delete(target.entity);
        else next.set(target.entity, created(device, target.entity, target[options], target[size]));
    }
    return next ?? held;
};

/** Records clearing each target that declares a clear color: its color to that color, and its depth to 1. */
export const recordClears = (encoder: GPUCommandEncoder, targets: ReadonlyMap<Entity, State>): void => {
    for (const target of targets.values()) {
        const color = target.options.clear;
        if (color === null) continue;
        const [r, g, b, a] = color;
        encoder.beginRenderPass({
            label: `clear target ${target.entity}`,
            colorAttachments: [{
                view: (target.multisampled ?? target.color).createView(), resolveTarget: target.multisampled === null ? undefined : target.color.createView(),
                clearValue: { r, g, b, a }, loadOp: "clear", storeOp: "store",
            }],
            depthStencilAttachment: target.depth === null ? undefined : { view: target.depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
        }).end();
    }
};

/** Destroys a render target's textures when it stops being one. */
export const release = Finalizer.create({ components: { with: [options, size] } }, (target, { resources }) => {
    const current = resources[states];
    const state = current?.get(target.entity);
    if (current === null || state === undefined) return;
    destroyTextures(state);
    const next = new Map(current);
    next.delete(target.entity);
    resources[states] = next;
});

/** Sets a render target's size in pixels, at least one by one. */
export const resize = System.create({ components: { with: [size] }, target: "target" }, (row, _context, input: { readonly target: Entity; readonly width: number; readonly height: number }) => {
    row[size] = [Math.max(1, Math.floor(input.width)), Math.max(1, Math.floor(input.height))];
});
