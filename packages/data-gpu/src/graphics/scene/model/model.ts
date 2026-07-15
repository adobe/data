// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { Node } from "../node/node.js";

/** One row of the `Model` archetype — a placed instance of a mesh asset. */
export interface Model extends Node {
    mesh: Entity;
}

export * as Model from "./public.js";
