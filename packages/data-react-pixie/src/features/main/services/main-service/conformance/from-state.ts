// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`: clear every sprite, set the
// `filter` resource, then insert the sprites. The inverse of `toState`.
// Test-only — the bridge that lets an ecs mutation be checked against the pure
// transform it stands for (see `expect-conforms.ts`).
//
// Clearing iterates tail→head so each delete is from the tail (no hole-fill
// shift). The ecs assigns entity ids from its own id-space, unrelated to the
// spec's domain `id`; the seeded entities are returned in `state.sprites` order
// so the caller can map spec `id` → entity positionally (see `expect-conforms.ts`).
export const fromState = (store: CoreDatabase.Store, state: State): readonly Entity[] => {
  for (const arch of store.queryArchetypes(store.archetypes.Sprite.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      store.delete(arch.columns.id.get(row));
    }
  }
  store.resources.filter = state.filter;
  return state.sprites.map((sprite) =>
    store.archetypes.Sprite.insert({
      position: sprite.position,
      rotation: sprite.rotation,
      kind: sprite.kind,
      hovered: sprite.hovered,
      active: sprite.active,
    }),
  );
};
