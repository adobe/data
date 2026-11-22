// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System, type Vec4 } from "@adobe/ecs";
import { baseColor } from "./component.base-color.js";
import { metallic } from "./component.metallic.js";
import { name } from "./component.name.js";
import { roughness } from "./component.roughness.js";
import { materialsRevision } from "./resource.materials-revision.js";

/** Changes how a material looks: its color, metallic and roughness; its name is `renameMaterial`'s. */
export const updateMaterial: System<MaterialProperties> = System.create({
    target: "entity",
    components: { with: [name, baseColor, metallic, roughness] },
}, (row, { resources }, input: MaterialProperties) => {
    row[baseColor] = input.baseColor;
    row[metallic] = input.metallic;
    row[roughness] = input.roughness;
    resources[materialsRevision] += 1;
});

/** A material and the properties it's given. */
type MaterialProperties = {
    readonly entity: Entity;
    readonly baseColor: Vec4;
    readonly metallic: number;
    readonly roughness: number;
};
