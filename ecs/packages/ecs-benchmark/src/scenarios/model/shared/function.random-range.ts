// © 2026 Adobe. MIT License. See /LICENSE for details.
import { nextRandom } from "./function.next-random.js";
import type { Random } from "./type.random.js";
import type { RandomStep } from "./type.random-step.js";

/** `random_xoshiro128::range`: the next output, from `low` to `high` inclusive. */
export const randomRange = (state: Random, low: number, high: number): RandomStep => {
    const step = nextRandom(state);
    return { value: (step.value % (high - low + 1)) + low, state: step.state };
};
