// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { FilterKind } from "../values/filter-kind/filter-kind.js";

// Scene-wide colour filter: settings scope (durable, not shared). The schema's
// default is "none".
export const filter = { ...FilterKind.schema, ...Scope.settings } satisfies ResourceSchema;
