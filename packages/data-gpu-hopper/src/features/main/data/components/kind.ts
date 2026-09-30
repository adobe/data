// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { Schema } from "@adobe/data/schema";
import { HazardKind } from "../values/hazard-kind/hazard-kind.js";

// Which hazard an entity is. Every hopper column is session scope: a local arcade run.
export const kind = { ...HazardKind.schema, ...Scope.session } satisfies Schema;
