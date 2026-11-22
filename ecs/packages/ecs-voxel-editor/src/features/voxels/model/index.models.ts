// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { Model } from "./archetype.model.js";

/** Every model, in the order they were made. */
export const models = Index.create({ key: [], components: { with: [...Model] } });
