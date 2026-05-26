// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { camera } from "./camera/camera-plugin.js";
import { light } from "./light/light-plugin.js";
import { model } from "./model/model-plugin.js";
import { node } from "./node/node-plugin.js";

/**
 * The user-facing scene data model. Combine into a service to define the
 * "renderable scene" surface a user can author: a transform hierarchy
 * (`node`), an observer (`camera`), lighting (`light`), and renderable
 * `Geometry` + `Model` archetypes (`model`).
 *
 * Pair with an implementation aggregator like `pbrIblRender` to actually
 * see anything on screen.
 */
export const scene = Database.Plugin.combine(node, camera, light, model);
