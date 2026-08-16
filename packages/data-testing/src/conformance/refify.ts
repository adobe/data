// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import { ref } from "../match/match.js";

// The store's schema map (`componentSchemas`) holds every component AND resource
// schema by name, so a State field — a singleton resource or an entity component —
// is looked up by its own key. Typed as `object` (not an index signature) so a real
// store's finite-keyed map satisfies it; a runner constrains its `Store` to this.
export type SchemaSource = { readonly componentSchemas: object };

const REF = Symbol.for("@adobe/data-testing:ref");

// Already an open matcher (a `ref`, `anyNumber`, vitest `expect.any`) — refify must
// not touch it, so a case may still hand-author a matcher where it wants one.
const isRefOrMatcher = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (REF in value || typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function");

// Replace an entity-reference number with a `ref` keyed by its own spec-id, so two
// occurrences of the same spec-id (an entity's map key and another entity's field
// pointing at it, or a singleton `selectedId`) become the same `ref` label and the
// matcher's bijection makes them line up on one ecs id. Non-reference values recurse
// structurally by schema so nested reference fields (a bundled `{ parent, order }`)
// are still found. A value with no schema, or a plain non-reference number, is left
// exactly as authored.
const refifyBySchema = (value: unknown, schema: Schema | undefined): unknown => {
  if (isRefOrMatcher(value)) return value;
  if (schema?.entity && typeof value === "number") return ref(String(value));
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const items = schema?.items;
    return items ? value.map((v) => refifyBySchema(v, items)) : value;
  }
  const props = schema?.properties;
  if (!props) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (key in props) out[key] = refifyBySchema(out[key], props[key]);
  }
  return out;
};

// An id in a map key or a list position is an entity reference by construction (no
// schema needed) — refify it directly.
const refifyId = (id: unknown): unknown =>
  isRefOrMatcher(id) ? id : typeof id === "number" ? ref(String(id)) : id;

// One entity value: refify each field against the same-named component schema.
const refifyEntityValue = (value: unknown, componentSchemas: Readonly<Record<string, Schema>>): unknown => {
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(out)) out[key] = refifyBySchema(out[key], componentSchemas[key]);
  return out;
};

// Turn a State's authored spec-ids into `ref`s so it compares to an ECS projection
// up to an id-bijection: every `Map` field is an identity-keyed entity collection
// (keys are ids, values are entity values), every other field is a singleton
// resource. The two id sets differ (each side mints its own), so the case author
// writes plain spec-ids everywhere and this makes them correspond — no hand-authored
// `Match.ref`. Idempotent: a matcher already in the State passes through untouched.
export const refifyState = (state: unknown, source: SchemaSource): unknown => {
  if (state === null || typeof state !== "object") return state;
  // A store's componentSchemas is a name→Schema map; the public type erases the
  // keys, so read it as the string-keyed map it is at runtime.
  const componentSchemas = source.componentSchemas as Readonly<Record<string, Schema>>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state as Record<string, unknown>)) {
    out[key] =
      value instanceof Map
        ? new Map([...value].map(([id, v]) => [refifyId(id), refifyEntityValue(v, componentSchemas)]))
        : refifyBySchema(value, componentSchemas[key]);
  }
  return out;
};
