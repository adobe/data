// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { delta } from './resource.delta.js';

/** Carries a frame's time into the world. */
export const setDelta: System<{ readonly seconds: number }> = System.create({}, ({ resources }, input: { readonly seconds: number }) => {
    resources[delta] = input.seconds;
});
