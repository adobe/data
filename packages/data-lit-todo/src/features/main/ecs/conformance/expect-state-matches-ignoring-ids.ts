// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import { expectStateMatches } from "../../data/state/expect-state-matches.js";

// Like `expectStateMatches`, but compares todos without regard to their `id`.
// The ecs projects each todo's entity id — drawn from its own quadrant-encoded
// id-space — into `State.id`, which does not match the spec's domain `id`. The
// projection therefore conforms only up to a renaming of ids: canonicalise both
// sides to a single id so the comparison rests on the visible fields (`name`,
// `complete`) and the resource, never the id value. Duplicates still count
// (the multiset comparison is by value), so name-sharing round-trips hold.
const canonicalizeIds = (state: State): State => ({
  ...state,
  todos: state.todos.map((todo) => ({ ...todo, id: 0 })),
});

export const expectStateMatchesIgnoringIds = (actual: State, expected: State): void =>
  expectStateMatches(canonicalizeIds(actual), canonicalizeIds(expected));
