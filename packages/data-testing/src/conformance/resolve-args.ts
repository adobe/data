// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import type { Resolve } from "./resolve.js";

// Resolve a case's `args` for the ecs side: replace each ENTITY-REFERENCE field
// (found via `argsSchema` — a field whose schema is `Entity.schema`, so
// `schema.entity` is set) with the entity the runner seeded for that spec-id.
// Recurses into nested object schemas. With no schema (a transition that addresses
// no entity) the args pass through unchanged — and the pure spec side never resolves
// at all, since there the spec-id already IS the entity key.
export const resolveArgs = (args: unknown, argsSchema: Schema | undefined, resolve: Resolve<unknown>): unknown => {
  if (!argsSchema || args === null || typeof args !== "object" || Array.isArray(args)) return args;
  const props = argsSchema.properties;
  if (!props) return args;
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const [key, sub] of Object.entries(props)) {
    if (!(key in out)) continue;
    if (sub.entity && typeof out[key] === "number") out[key] = resolve(out[key]);
    else if (sub.properties && out[key] !== null && typeof out[key] === "object") out[key] = resolveArgs(out[key], sub, resolve);
  }
  return out;
};
