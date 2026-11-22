// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { model } from "./component.model.js";
import { source } from "./component.source.js";

/** The models referenced from the library, which saving writes back to their files. */
export const referencedModels = Index.create({ key: [], components: { with: [model, source] } });
