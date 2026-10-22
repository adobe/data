// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Wave } from "../values/wave/wave.js";

// The current wave number. Session scope.
export const wave = { ...Wave.schema, ...Scope.session } satisfies ResourceSchema;
