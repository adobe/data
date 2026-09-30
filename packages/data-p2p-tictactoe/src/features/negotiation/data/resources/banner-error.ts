// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Boolean } from "@adobe/data/schema";

// Whether the banner is styled as an error.
export const bannerError = { ...Boolean.schema, ...Scope.session } satisfies ResourceSchema;
