// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { baseColor } from "./component.base-color.js";
import { name } from "./component.name.js";

/** The material of a name, or null: names are unique in a document, and case-sensitive. */
export const materialNamed = Index.create({ key: [name], unique: true, components: { with: [baseColor] } });
