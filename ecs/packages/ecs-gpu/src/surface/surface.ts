// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Finalizer, System, type Vec2, type World } from "@adobe/ecs";
import * as Target from "../target/public.js";

/** How a surface presents: how its alpha composites with the page, its color space, and its tone mapping. */
export type Options = {
    readonly alphaMode: GPUCanvasAlphaMode;
    readonly colorSpace: PredefinedColorSpace;
    readonly toneMapping: GPUCanvasToneMappingMode;
};

export const Options = {
    default: { alphaMode: "opaque", colorSpace: "srgb", toneMapping: "standard" },
} as const;

/** A surface's canvas, configured for the world's device in its target's format. */
export type State = {
    readonly entity: Entity;
    readonly canvas: OffscreenCanvas;
    readonly context: GPUCanvasContext;
    readonly device: GPUDevice;
    readonly format: GPUTextureFormat;
    readonly options: Options;
};

/**
 * A render target with these presents to a canvas: the canvas, on the world's thread, and how it presents. The
 * canvas's size follows the target's.
 */
export const canvas = Symbol("Surface.canvas");
export const options = Symbol("Surface.options");
/** Each surface's configured canvas, by its entity: null until surfaces are first updated. */
export const states = Symbol("Surface.states");

declare module "@adobe/ecs" {
    interface Components {
        [canvas]: { type: OffscreenCanvas; transfer: true };
        [options]: { type: Options };
    }
    interface Resources {
        [states]: { type: ReadonlyMap<Entity, State> | null };
    }
}

/**
 * A surface presenting to `canvas`, moved to the world's thread, of `width` by `height` pixels: a canvas's
 * `transferControlToOffscreen()`, or an `OffscreenCanvas` of its own. Resolves to its entity.
 */
export const attach = System.create({}, ({ commands }, input: {
    readonly canvas: OffscreenCanvas;
    readonly width: number;
    readonly height: number;
    readonly target?: Target.Options;
    readonly surface?: Options;
}) => commands.spawn([Target.options, Target.size, canvas, options])({
    [Target.options]: input.target ?? Target.Options.default,
    [Target.size]: [Math.max(1, Math.floor(input.width)), Math.max(1, Math.floor(input.height))],
    [canvas]: input.canvas,
    [options]: input.surface ?? Options.default,
}));

const sameOptions = (a: Options, b: Options): boolean => a.alphaMode === b.alphaMode && a.colorSpace === b.colorSpace && a.toneMapping === b.toneMapping;

/** A surface as an index lists it: its entity, canvas, options and its target's size. */
export type Listed = { readonly entity: Entity; readonly [canvas]: OffscreenCanvas; readonly [options]: Options; readonly [Target.size]: Vec2.U32 };

/**
 * Each surface's canvas sized to its target and configured for `device` in its target's format, again where either
 * changed; with no device, or no target state, unconfigured. Gives `previous` itself when nothing changed.
 */
export const updated = (device: GPUDevice | null, targets: ReadonlyMap<Entity, Target.State>, previous: ReadonlyMap<Entity, State> | null, surfaces: { readonly length: number; at(index: number): Listed }): ReadonlyMap<Entity, State> => {
    const held = previous ?? new Map<Entity, State>();
    let next: Map<Entity, State> | null = null;
    for (let i = 0; i < surfaces.length; i++) {
        const surface = surfaces.at(i);
        const presented = surface[canvas];
        const [width, height] = surface[Target.size];
        if (presented.width !== width) presented.width = width;
        if (presented.height !== height) presented.height = height;
        const target = targets.get(surface.entity);
        const old = held.get(surface.entity);
        if (device === null || target === undefined) {
            if (old === undefined) continue;
            old.context.unconfigure();
            next ??= new Map(held);
            next.delete(surface.entity);
            continue;
        }
        const declared = surface[options];
        if (old !== undefined && old.device === device && old.format === target.format && old.canvas === presented && sameOptions(old.options, declared)) continue;
        const context = presented.getContext("webgpu");
        if (context === null) continue;
        context.configure({
            device, format: target.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
            alphaMode: declared.alphaMode, colorSpace: declared.colorSpace, toneMapping: { mode: declared.toneMapping },
        });
        next ??= new Map(held);
        next.set(surface.entity, { entity: surface.entity, canvas: presented, context, device, format: target.format, options: declared });
    }
    return next ?? held;
};

/** Unconfigures a surface's canvas when it stops being one. */
export const release = Finalizer.create({ components: { with: [canvas] } }, (surface, { resources }) => {
    const current = resources[states];
    const state = current?.get(surface.entity);
    if (current === null || state === undefined) return;
    state.context.unconfigure();
    const next = new Map(current);
    next.delete(surface.entity);
    resources[states] = next;
});

/** A canvas's size in device pixels, from what a `ResizeObserver` saw of it. */
const pixelsOf = (entry: ResizeObserverEntry): readonly [number, number] => {
    const [device] = entry.devicePixelContentBoxSize ?? [];
    if (device !== undefined) return [device.inlineSize, device.blockSize];
    const [box] = entry.contentBoxSize;
    const scale = globalThis.devicePixelRatio ?? 1;
    return box === undefined ? [entry.contentRect.width * scale, entry.contentRect.height * scale] : [box.inlineSize * scale, box.blockSize * scale];
};

/**
 * Keeps a surface's size the size of `element` on the page, in device pixels, on the thread the page is on: the world
 * may be here or on a worker that joined it. Returns a function that stops.
 */
export const observe = (element: Element, world: Pick<World, "run">, surface: Entity): (() => void) => {
    const observer = new ResizeObserver(entries => {
        const entry = entries.at(-1);
        if (entry === undefined) return;
        const [width, height] = pixelsOf(entry);
        world.run(Target.resize, { target: surface, width, height }).catch(reportError);
    });
    try {
        observer.observe(element, { box: "device-pixel-content-box" });
    } catch {
        observer.observe(element);
    }
    return () => observer.disconnect();
};
