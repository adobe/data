// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "../../ecs/entity/entity.js";
import type { Resolve } from "./resolve.js";

// A spec entity reference inside a case's `args`: `{ id: entity(1) }` names "the
// entity seeded for spec-id 1". It closes the one irreducible spec↔ecs vocabulary
// gap — identity: the pure spec reads the data-id, the ecs reads the entity the
// runner resolves. Typed as the id it stands in for, so it slots into the
// transform's own arg type (`{ id: number }`), exactly like `Match.anyNumber`.
const ENTITY_REF = Symbol.for("@adobe/data/testing:entity-ref");

export const entity = <T>(specId: T): T => ({ [ENTITY_REF]: specId }) as unknown as T;

const isEntityRef = (value: unknown): value is { readonly [ENTITY_REF]: unknown } =>
  typeof value === "object" && value !== null && ENTITY_REF in value;

// Adapt a case's `args` for one side of the conformance. `resolve` present → the
// ecs side (refs become seeded entities); absent → the pure-spec side (refs become
// their data-id). Only the top-level arg values are inspected — a `ref` is always a
// direct arg field. Non-ref values pass through untouched; a non-object `args`
// (a scalar `dt`, or `undefined`) passes through whole.
export const adaptArgs = <Args>(args: Args, resolve?: Resolve<unknown>): Args => {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return args;
  let changed = false;
  const next: Record<string, unknown> = { ...(args as object) };
  for (const [key, value] of Object.entries(next)) {
    if (isEntityRef(value)) {
      const specId = value[ENTITY_REF];
      next[key] = resolve ? (resolve(specId) as unknown) : specId;
      changed = true;
    }
  }
  return (changed ? next : args) as Args;
};

export type { Entity };
