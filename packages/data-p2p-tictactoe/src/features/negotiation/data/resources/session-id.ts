// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Schema } from "@adobe/data/schema";

// The sync server's session id; `null` until the sync link is up.
export const sessionId = { ...Schema.Nullable({ type: "string" }), default: null, ...Scope.session } satisfies ResourceSchema;
