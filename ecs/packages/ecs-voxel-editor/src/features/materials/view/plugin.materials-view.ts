// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Plugin } from "@adobe/ecs";
import { MaterialDetails } from "../elements/index.js";
import { copyMaterial, renameMaterial, updateMaterial } from "../model/index.js";
import { all, define, on, root } from "../../../view/index.js";
import { bindMaterialDetails } from "./plugin.materials-view/system.bind-material-details.js";
import { findMaterialDetails } from "./plugin.materials-view/system.find-material-details.js";

/**
 * The selected material's details within the app's root: editing its properties as the user moves a field, renaming
 * it, saying why a name wasn't taken, and copying it as a new material.
 */
export const materialsView: Plugin<typeof root> = {
    systems: [findMaterialDetails, bindMaterialDetails],
    connect: (world, { [root]: page }) => {
        define({ "material-details": MaterialDetails });
        const details = page.querySelector("material-details");
        // The details' ids are the materials' entities, as bindMaterialDetails gives them.
        const entityOf = (id: number) => id as Entity;
        return all(
            on(page, "material-change", event => {
                const { id, color, metallic, roughness } = event.detail;
                void world.run(updateMaterial, { entity: entityOf(id), baseColor: [...linearOf(color), 1], metallic, roughness });
            }),
            on(page, "material-rename", event => {
                void world.run(renameMaterial, { entity: entityOf(event.detail.id), name: event.detail.name }).then(error => {
                    if (details !== null) details.error = error;
                });
            }),
            on(page, "material-copy", event => void world.run(copyMaterial, { entity: entityOf(event.detail.id) })),
        );
    },
};

/** An sRGB `#rrggbb` color as linear channels. */
const linearOf = (hex: string): [number, number, number] => {
    const channel = (offset: number): number => (parseInt(hex.slice(offset, offset + 2), 16) / 255) ** 2.2;
    return [channel(1), channel(3), channel(5)];
};
