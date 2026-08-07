// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { Sprite } from "../../../data/sprite/sprite.js";
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one entity back into its `data/` value — the per-entity projection
// `toState` folds over, and the single place the ecs↔data mapping for a sprite
// lives. The projected `id` is the entity id (the ecs's own id-space).
const toData = (store: CoreDatabase.Store, entity: Entity): Sprite => {
  const row = store.read(entity, store.archetypes.Sprite);
  if (row === null)
    throw new Error("conformance projection: expected a sprite entity");
  return {
    id: row.id,
    position: row.position,
    rotation: row.rotation,
    kind: row.kind,
    hovered: row.hovered,
    active: row.active,
  };
};

// The test-only ecs↔`State` projection, passed to `Conformance.runFeature`.
// `fromState` seeds a store to a `State` (clear every sprite, set `filter`, then
// insert the sprites) and returns the `spec id → seeded entity` map so the
// runners resolve id-addressed operations generically; `toState` reads it back;
// `toData` reads one entity.
export const projection = {
  fromState: (
    store: CoreDatabase.Store,
    state: State,
  ): ReadonlyMap<number, Entity> => {
    for (const arch of store.queryArchetypes(
      store.archetypes.Sprite.components,
    )) {
      for (let row = arch.rowCount - 1; row >= 0; row--) {
        store.delete(arch.columns.id.get(row));
      }
    }
    store.resources.filter = state.filter;
    return new Map(
      state.sprites.map((sprite) => [
        sprite.id,
        store.archetypes.Sprite.insert({
          position: sprite.position,
          rotation: sprite.rotation,
          kind: sprite.kind,
          hovered: sprite.hovered,
          active: sprite.active,
        }),
      ]),
    );
  },
  toState: (store: CoreDatabase.Store): State => ({
    sprites: [...store.select(store.archetypes.Sprite.components)].map(
      (entity) => toData(store, entity),
    ),
    filter: store.resources.filter,
  }),
  toData,
};
