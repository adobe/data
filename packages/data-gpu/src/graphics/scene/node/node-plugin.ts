// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { nodeData } from "./node-data-plugin.js";
import { transform } from "./transform-plugin.js";

/**
 * Full node plugin — spatial hierarchy data plus the `transform` system that
 * derives `_worldMatrix` each frame. Use `Node.plugin` (= this) to get both.
 * Use `nodeData` directly if you only need the declared components and archetype
 * without the per-frame TRS computation.
 */
export const plugin = Database.Plugin.combine(nodeData, transform);
