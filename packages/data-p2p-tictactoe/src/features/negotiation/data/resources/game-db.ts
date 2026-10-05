// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";

// The live synced game database, set once the peer link is up. A non-serializable
// handle no schema can express, so it has only a default. `unknown` keeps the
// negotiation feature game-agnostic; the UI narrows it at the render boundary.
export const gameDb = { default: null as unknown, ...Scope.session } satisfies ResourceSchema;
