// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Camera } from "./camera/camera.js";
import { Light } from "./light/light.js";
import { Model } from "./model/model.js";
import { Node } from "./node/node.js";

/**
 * The user-facing scene data model. Combine into a service to define the
 * "renderable scene" surface a user can author: a transform hierarchy
 * (`node`), an observer (`Camera.plugin`), lighting (`light`), and renderable
 * `Geometry` + `Model` archetypes (`model`).
 *
 * Pair with an implementation aggregator like `pbrIblRender` to actually
 * see anything on screen.
 */
export const scene = Database.Plugin.combine(Node.plugin, Camera.plugin, Light.plugin, Model.plugin);
