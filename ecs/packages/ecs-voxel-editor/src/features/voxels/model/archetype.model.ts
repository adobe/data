// © 2026 Adobe. MIT License. See /LICENSE for details.
import { model } from "./component.model.js";
import { modelName } from "./component.model-name.js";
import { scale } from "./component.scale.js";
import { size } from "./component.size.js";

/** What a model spawns with; a referenced one has its `source` too. */
export const Model = [model, modelName, size, scale] as const;
