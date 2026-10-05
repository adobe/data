// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Outcome } from "../data/values/outcome/outcome.js";
import type { State } from "./state.js";
import { frogOutcome } from "./frog-outcome.js";
import { winGoal } from "./win-goal.js";
import { loseLife } from "./lose-life.js";
import { whilePlaying } from "./while-playing.js";

type CollisionPatch = Pick<State, "frog" | "lives" | "score" | "status">;

// The `collision` system: resolve the frog's fate where it stands — score a win, or on
// a fatal outcome spend a life (respawn, or game over on the last life).
export const collision = (
  state: Pick<State, "entities" | "frog" | "lanes" | "boardWidth" | "status" | "score" | "lives">,
): CollisionPatch => {
  const held: CollisionPatch = { frog: state.frog, lives: state.lives, score: state.score, status: state.status };
  return whilePlaying(state.status, held, () => {
    const outcome = frogOutcome(state);
    if (outcome === "win") return { ...held, ...winGoal(state) };
    if (Outcome.isFatal[outcome]) return { ...held, ...loseLife(state) };
    return held;
  });
};
