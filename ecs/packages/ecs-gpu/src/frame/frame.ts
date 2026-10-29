// © 2026 Adobe. MIT License. See /LICENSE for details.
import { gpuDevice, Index, System } from "@adobe/ecs";
import * as Surface from "../surface/surface.js";
import * as Target from "../target/target.js";
import * as View from "../view/view.js";

const everyTarget = Index.create({ key: [], components: { with: [Target.options, Target.size] } });
const everySurface = Index.create({ key: [], components: { with: [Surface.canvas, Surface.options, Target.size] } });
const everyView = Index.create({ key: [], components: { with: [View.target, View.viewport, View.projection] } });

/**
 * Brings render targets, surfaces and views up to date with their entities and the world's device, then clears each
 * target that declares a clear color: its color to that color and its depth to 1. Draws go after it and before
 * `present`.
 */
export const update = System.create({
    lookup: { targets: { index: everyTarget }, surfaces: { index: everySurface }, views: { index: everyView } },
}, ({ resources, lookup }) => {
    const device = resources[gpuDevice];
    const targets = Target.updated(device, resources[Target.states], lookup.targets());
    const surfaces = Surface.updated(device, targets, resources[Surface.states], lookup.surfaces());
    const views = View.updated(device, targets, resources[View.states], lookup.views());
    if (targets !== resources[Target.states]) resources[Target.states] = targets;
    if (surfaces !== resources[Surface.states]) resources[Surface.states] = surfaces;
    if (views !== resources[View.states]) resources[View.states] = views;
    if (device === null || targets.size === 0) return;
    const encoder = device.createCommandEncoder({ label: "clear targets" });
    Target.recordClears(encoder, targets);
    device.queue.submit([encoder.finish()]);
});

/**
 * Copies each surface's target into its canvas, in one body, so every draw of the run is in the frame the browser
 * presents, even where the run waited between them.
 */
export const present = System.render({
    components: { with: [Surface.canvas] },
    shader: { accessors: {} },
    after: [update],
}, ({ encoder }, { resources }) => {
    const targets = resources[Target.states];
    for (const surface of resources[Surface.states]?.values() ?? []) {
        const target = targets?.get(surface.entity);
        if (target === undefined || target.device !== surface.device) continue;
        const current = surface.context.getCurrentTexture();
        const [width, height] = target.size;
        if (current.width !== width || current.height !== height) continue;
        encoder.copyTextureToTexture({ texture: target.color }, { texture: current }, [width, height]);
    }
});

/** Every system of a frame, in order: targets, surfaces and views updated and targets cleared, then surfaces presented. */
export const systems = System.create({ systems: [update, present] });
