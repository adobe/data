// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Wave } from "../../data/values/wave/wave.js";
import type { CoreDatabase } from "../core/core-database.js";
import type { RandomService } from "../../services/random-service/random-service.js";
import { nextWave } from "./next-wave.js";

// The randomized refill the `waves` system and the `spawnRandomWave` action
// dispatch: each rock's speed is `Wave.speed · (0.5 + random.next())`. It takes the
// injected service as an argument, so it is conformed through the action.
export const refillWave = (
  t: CoreDatabase.Store,
  { random }: { readonly random: RandomService },
): void => {
  nextWave(t, () => Wave.speed * (0.5 + random.next()));
};
