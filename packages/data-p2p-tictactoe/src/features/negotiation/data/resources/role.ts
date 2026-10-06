// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceSchema } from "@adobe/data/ecs";
import { Schema, Scope } from "@adobe/data/schema";
import { Role } from "../values/role/role.js";

// This peer's side of the handshake; `null` until it hosts or joins.
export const role = { ...Schema.Nullable(Role.schema), default: null, ...Scope.session } satisfies ResourceSchema;
