// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { model } from "./component.model.js";
import { modelName } from "./component.model-name.js";

/** The model of a name, or null. */
export const modelNamed = Index.create({ key: [modelName], unique: true, components: { with: [model] } });
