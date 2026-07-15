import type { Material } from "./material.js";

/** Material property bundle without registry name (defaults merged at insert). */
export type MaterialDefinition = Partial<Omit<Material, "name">>;
