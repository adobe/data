// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { data, nextRandom, timeDelta } from "../../../../model/index.js";

/** `DataSystem`. */
export const dataSystem: System = System.create({ kernel: true, components: { with: [data] } }, row => {
    const value = row[data];
    const step = nextRandom(value.rng);
    row[data] = { thingy: (value.thingy + 1) % 1000000, dingy: value.dingy + 0.0001 * timeDelta, mingy: !value.mingy, seed: value.seed, rng: step.state, numgy: step.value };
});
