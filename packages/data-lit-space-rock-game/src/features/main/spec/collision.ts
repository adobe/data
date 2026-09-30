// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { resolveBulletHits } from "./resolve-bullet-hits.js";
import { resolveShipHits } from "./resolve-ship-hits.js";
import { whilePlaying } from "./while-playing.js";

// The `collision` system: bullet↔asteroid hits first, then ship↔asteroid against
// what is left.
export const collision = (
  state: Pick<State, "ship" | "entities" | "bounds" | "score" | "lives">,
  { dt }: { readonly dt: number },
): Pick<State, "ship" | "entities" | "score" | "lives"> =>
  whilePlaying(state, (playing) => {
    const hits = resolveBulletHits(playing, { dt });
    return { ...hits, ...resolveShipHits({ ...playing, ...hits }) };
  });
