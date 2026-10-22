// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Ship } from "../values/ship/ship.js";

// The one player ship. Session scope.
export const ship = { ...Ship.schema, default: Ship.spawn([0, 0]), ...Scope.session } satisfies ResourceSchema;
