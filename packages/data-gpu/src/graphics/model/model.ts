// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { Node } from "../node/node.js";

/**
 * One row of the `Model` archetype — a placed instance of a Geometry. A
 * Node (transform + visibility + parent) plus a reference to the Geometry
 * the renderer should draw.
 */
export interface Model extends Node {
    geometry: Entity;
    pickable: true;
}

export * as Model from "./public.js";
