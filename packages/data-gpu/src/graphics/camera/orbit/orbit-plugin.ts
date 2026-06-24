// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { orbitData } from "./orbit-data-plugin.js";
import { orbitSystem } from "./orbit-system-plugin.js";

/**
 * Orbit camera — data + systems combined. Add to any service that needs
 * a draggable, auto-spinning, model-fitting camera.
 *
 * Exported as `Orbit.plugin` via orbit.ts → public.ts.
 */
export const plugin = Database.Plugin.combine(orbitData, orbitSystem);
