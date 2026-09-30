// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Input } from "../values/input/input.js";

// The player's intent, read by the systems each tick. Session scope.
export const input = { ...Input.schema, default: Input.none, ...Scope.session } satisfies ResourceSchema;
