// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";

// The status banner text; empty hides the banner.
export const bannerText = { type: "string", default: "", ...Scope.session } as const satisfies ResourceSchema;
