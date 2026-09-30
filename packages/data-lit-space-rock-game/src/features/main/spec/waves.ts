// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Services } from "../services/services.js";
import { spawnRandomWave } from "./spawn-random-wave.js";
import { whilePlaying } from "./while-playing.js";

// The `waves` system: refill a cleared field with a randomized wave.
export const waves = (
  state: Pick<State, "entities" | "wave" | "bounds" | "lives">,
  { random }: Pick<Services, "random">,
): Pick<State, "entities" | "wave"> => whilePlaying(state, (playing) => spawnRandomWave(playing, { random }));
