// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Lives } from "../values/lives/lives.js";

// Lives remaining. Session scope.
export const lives = { ...Lives.schema, default: Lives.initial, ...Scope.session } satisfies ResourceSchema;
