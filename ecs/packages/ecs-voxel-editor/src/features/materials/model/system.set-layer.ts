// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { layer } from "./resource.layer.js";
import type { Layer } from "./type.layer.js";

/** Switches editing to building with materials or painting voxels; `null` switches to the other. */
export const setLayer: System<{ readonly layer: Layer | null }> = System.create({}, ({ resources }, input: { readonly layer: Layer | null }) => {
    const next = input.layer ?? (resources[layer] === "paint" ? "material" : "paint");
    if (resources[layer] !== next) resources[layer] = next;
});
