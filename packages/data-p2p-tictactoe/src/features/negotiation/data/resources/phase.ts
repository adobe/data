// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Phase } from "../values/phase/phase.js";

// The screen this peer is on. Session scope: the negotiation database is local-only.
export const phase = { ...Phase.schema, default: "idle", ...Scope.session } satisfies ResourceSchema;
