// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../../ecs/entity/entity.js";

// Maps a spec-domain id to the ecs entity seeded for it. A feature's `fromState`
// returns the `Id → Entity` map (it already loops its collections to seed); the
// conformance runners turn that map into this resolver, so no feature writes id
// resolution by hand. An id no entity carries resolves to `Entity.none`, so an
// id-addressed transaction reads no such entity and is a no-op.
export type Resolve<Id> = (id: Id) => Entity;

// Build a resolver from a `fromState` seed map. A feature whose transactions are
// addressed by index or are singleton (no id → entity mapping) returns `void`
// from `fromState`; its resolver is then never called, and any id resolves to
// `Entity.none`.
export const resolver = <Id>(seeded: ReadonlyMap<Id, Entity> | void): Resolve<Id> => (id) =>
  (seeded ? seeded.get(id) : undefined) ?? Entity.none;
