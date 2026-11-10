// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { data } from "../shared/component.data.js";
import { timeDelta } from "../shared/constant.time-delta.js";
import { nextRandom } from "../shared/function.next-random.js";

/** `DataSystem`. */
export const dataSystem: System = System.create({ kernel: true, components: { with: [data] } }, row => {
    const value = row[data];
    const step = nextRandom(value.rng);
    row[data] = { thingy: (value.thingy + 1) % 1000000, dingy: value.dingy + 0.0001 * timeDelta, mingy: !value.mingy, seed: value.seed, rng: step.state, numgy: step.value };
});
