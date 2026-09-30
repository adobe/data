// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceSchema } from "@adobe/data/ecs";
import type { Cursors } from "../values/cursors/cursors.js";

// Peer cursor positions, written only through transient (never-committed) envelopes.
// Default-only (no `type`): a typed object of `Vec2`s would be struct-packed, and a
// struct column needs every field while each mark's cursor is optional.
// Document scope, not `Scope.presence`: sync never replicates a `nonPersistent`
// resource, and these must reach the peer.
export const cursors = { default: {} as Cursors } satisfies ResourceSchema;
