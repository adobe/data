// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { parent } from "../../voxels/model/index.js";
import { SelectedFace } from "./archetype.selected-face.js";

/** The selected faces of a model, `lookup(model)`, or of every model, `lookup()`, a model's together. */
export const faces = Index.create({ key: [parent], sorted: true, components: { with: [...SelectedFace] } });
