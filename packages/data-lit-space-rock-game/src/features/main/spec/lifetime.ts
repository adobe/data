// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Input } from "../data/values/input/input.js";
import { fireBullet } from "./fire-bullet.js";
import { stepBullets } from "./step-bullets.js";
import { whilePlaying } from "./while-playing.js";

// The `lifetime` system: fire if the trigger is pulled, then advance, age and retire
// every bullet, the new one included.
export const lifetime = (
  state: Pick<State, "ship" | "entities" | "bounds" | "lives">,
  { dt, input }: { readonly dt: number; readonly input: Input },
): Pick<State, "entities"> =>
  whilePlaying(state, (playing) =>
    stepBullets(input.fire ? { ...playing, ...fireBullet(playing) } : playing, { dt }),
  );
