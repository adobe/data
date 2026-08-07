// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../../ecs/entity/entity.js";

// Maps a spec-domain id to the ecs entity seeded for it. A feature's `fromState`
// returns the `Id → Entity` map (it already loops its collections to seed); the
// conformance runners turn that map into this resolver, so no feature writes id
// resolution by hand. An id no entity carries resolves to `Entity.none`, so an
// id-addressed transaction reads no such entity and is a no-op.
export type Resolve<Id> = (id: Id) => Entity;

export const resolver = <Id>(seeded: ReadonlyMap<Id, Entity>): Resolve<Id> => (id) =>
  seeded.get(id) ?? Entity.none;
