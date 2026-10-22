// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import { Entity } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";

// The selected todo: a reference to one entity (`Entity.none` = no selection). The
// `Entity.schema` mark makes conformance compare it up to the id-bijection. Session scope.
export const selectedTodo = { ...Entity.schema, default: Entity.none, ...Scope.session } satisfies ResourceSchema;
