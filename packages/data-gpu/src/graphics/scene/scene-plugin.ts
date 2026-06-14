// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { plugin as nodePlugin } from "./node/node-plugin.js";
import { mesh } from "./model/mesh-plugin.js";
import { SceneUniforms } from "./scene-uniforms/scene-uniforms.js";

/**
 * The complete authored scene — spatial hierarchy, models, camera, lighting,
 * and the GPU uniform buffer that ties them together for rendering.
 *
 * Combines:
 *   - `Node.plugin`           (node data + transform system)
 *   - `mesh`                 (Mesh asset + Model/MeshInstance archetypes)
 *   - `SceneUniforms.plugin`  (camera resource + light resource + GPU uniform packing)
 *
 * Add a camera controller (e.g. `Orbit.plugin`), animation, and a renderer
 * (`pbrIblRender`) to get a working interactive scene.
 */
export const scene = Database.Plugin.combine(nodePlugin, mesh, SceneUniforms.plugin);
