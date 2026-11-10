// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { gpuData } from "./component.gpu-data.js";
import { timeDelta } from "../shared/constant.time-delta.js";
import { nextRandom } from "../shared/function.next-random.js";

/** `DataSystem` as a GPU kernel. */
export const gpuDataSystem: System = System.create({ kernel: "gpu", components: { with: [gpuData] } }, row => {
    const value = row[gpuData];
    const step = nextRandom(value.rng);
    row[gpuData] = { thingy: (value.thingy + 1) % 1000000, dingy: value.dingy + 0.0001 * timeDelta, mingy: !value.mingy, seed: value.seed, rng: step.state, numgy: step.value };
});
