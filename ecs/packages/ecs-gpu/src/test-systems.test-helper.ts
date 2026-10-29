// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, gpuDevice, System, type Vec4 } from "@adobe/ecs";
import * as Surface from "./surface/public.js";
import * as Target from "./target/public.js";
import * as View from "./view/public.js";

export const spawnTarget = System.create({}, ({ commands }, input: { readonly width: number; readonly height: number; readonly clear?: Vec4 | null; readonly sampleCount?: 1 | 4 }) =>
    commands.spawn([Target.options, Target.size])({
        [Target.options]: { ...Target.Options.default, clear: input.clear === undefined ? Target.Options.default.clear : input.clear, sampleCount: input.sampleCount ?? 1 },
        [Target.size]: [input.width, input.height],
    }));

export const spawnView = System.create({}, ({ commands }, input: { readonly target: Entity; readonly viewport: Vec4 }) =>
    commands.spawn([View.target, View.viewport, View.projection])({ [View.target]: input.target, [View.viewport]: input.viewport, [View.projection]: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }));

export const despawn = System.create({}, ({ commands }, input: { readonly entity: Entity }) => { commands.despawn(input.entity); });

export const setClear = System.create({ components: { with: [Target.options] }, target: "target" }, (row, _context, input: { readonly target: Entity; readonly clear: Vec4 }) => {
    row[Target.options] = { ...row[Target.options], clear: input.clear };
});

export const targetStates = System.create({}, ({ resources }) => resources[Target.states]);
export const surfaceStates = System.create({}, ({ resources }) => resources[Surface.states]);
export const viewStates = System.create({}, ({ resources }) => resources[View.states]);
export const currentDevice = System.create({}, ({ resources }) => resources[gpuDevice]);

/** A target's size, or null for an entity that isn't one. */
export const sizeOf = System.create({ lookup: { targets: { with: [Target.size] } } }, ({ lookup }, input: { readonly target: Entity }) =>
    lookup.targets(input.target)?.[Target.size] ?? null);

/** Whether a surface's canvas is configured for the world's device. */
export const configured = System.create({}, ({ resources }, input: { readonly surface: Entity }) => resources[Surface.states]?.has(input.surface) ?? false);
