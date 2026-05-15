// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

/**
 * Default scene uniform struct for a single-viewport, single-directional-light setup.
 * Use `defaultSceneUniforms` plugin to have this written to a GPU buffer each frame.
 *
 * This is a starting point, not a required contract. Consumers that need different
 * fields (multiple lights, fog, time, etc.) should define their own schema + plugin.
 */
export type SceneUniforms = Schema.ToType<typeof schema>;

export * as SceneUniforms from "./public.js";
