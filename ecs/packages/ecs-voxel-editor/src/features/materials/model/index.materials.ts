// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { Material } from "./archetype.material.js";

/** Every material, in the order they were spawned. */
export const materials = Index.create({ key: [], components: { with: [...Material] } });
