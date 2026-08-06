// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";

// Like `expectStateMatches`, but compares sprites without regard to their `id`.
// The ecs projects each sprite's entity id — drawn from its own id-space — into
// `Sprite.id`, which does not match the spec's domain `id`. The projection
// therefore conforms only up to a renaming of ids: canonicalise both sides to a
// single id so the comparison rests on the visible fields (position, rotation,
// kind, hovered, active) and the filter resource, never the id value.
const canonicalizeIds = (state: State): State => ({
  ...state,
  sprites: state.sprites.map((sprite) => ({ ...sprite, id: 0 })),
});

export const expectStateMatchesIgnoringIds = (actual: State, expected: State): void =>
  expectStateMatches(canonicalizeIds(actual), canonicalizeIds(expected));
