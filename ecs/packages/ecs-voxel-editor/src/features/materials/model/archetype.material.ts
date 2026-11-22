// © 2026 Adobe. MIT License. See /LICENSE for details.
import { baseColor } from "./component.base-color.js";
import { metallic } from "./component.metallic.js";
import { name } from "./component.name.js";
import { roughness } from "./component.roughness.js";

/** What a material spawns with. */
export const Material = [name, baseColor, metallic, roughness] as const;
