// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { Sprite } from "../../../data/sprite/sprite.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import { toData } from "./to-data.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`. Sprites
// are read in archetype/insertion order (there is no ordering column) through the
// per-entity `toData` projection; the projected `id` is the entity id (the ecs's
// own id-space, not the spec's domain id), so conformance comparisons leave it
// open (`anyNumber`). Test-only.
const readSprites = (store: CoreDatabase.Store): Sprite[] =>
  [...store.select(store.archetypes.Sprite.components)].map((entity) => toData(store, entity));

export const toState = (store: CoreDatabase.Store): State => ({
  sprites: readSprites(store),
  filter: store.resources.filter,
});
