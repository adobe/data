// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/**
 * Transition to the live game once the peer connection is established. The
 * non-serializable game database handle it accompanies is stored separately by
 * the ecs `setGameDb` transaction; this pure step models only the visible
 * phase / connection change.
 */
export const enterGame = <T extends State>(state: T): T => ({
  ...state,
  phase: "game",
  connection: "connected",
});
