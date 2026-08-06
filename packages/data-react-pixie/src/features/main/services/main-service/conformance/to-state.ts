// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { Sprite } from "../../../data/sprite/sprite.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`. Each
// sprite is read through its full `Sprite` archetype so the row shape never
// aliases; the projected `id` is the entity id (the ecs's own id-space, not the
// spec's domain id), so conformance comparisons ignore it — see
// `expect-state-matches-ignoring-ids`. Test-only.
const readSprites = (store: CoreDatabase.Store): Sprite[] => {
  const sprites: Sprite[] = [];
  for (const entity of store.select(store.archetypes.Sprite.components)) {
    const row = store.read(entity, store.archetypes.Sprite);
    if (row === null) throw new Error("conformance projection: expected a sprite entity");
    sprites.push({
      id: row.id,
      position: row.position,
      rotation: row.rotation,
      kind: row.kind,
      hovered: row.hovered,
      active: row.active,
    });
  }
  return sprites;
};

export const toState = (store: CoreDatabase.Store): State => ({
  sprites: readSprites(store),
  filter: store.resources.filter,
});
