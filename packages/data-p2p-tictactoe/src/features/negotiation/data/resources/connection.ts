// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { ConnectionState } from "../values/connection-state/connection-state.js";

export const connection = { ...ConnectionState.schema, default: "idle", ...Scope.session } satisfies ResourceSchema;
