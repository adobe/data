// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceSchema } from "@adobe/data/ecs";
import { Schema, Scope } from "@adobe/data/schema";

// The sync server's session id; `null` until the sync link is up.
export const sessionId = { ...Schema.Nullable({ type: "string" }), default: null, ...Scope.session } satisfies ResourceSchema;
