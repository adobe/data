// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { surface } from './resource.surface.js';

/** From main: the canvas the world draws into, moved in the run's input. */
export const attachSurface: System<{ readonly canvas: OffscreenCanvas }> = System.create({}, ({ resources }, input: { readonly canvas: OffscreenCanvas }) => {
    resources[surface] = input.canvas;
});
