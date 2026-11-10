// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { gpuData } from "./component.gpu-data.js";
import { position } from "../shared/component.position.js";
import { velocity } from "../shared/component.velocity.js";
import { randomRange } from "../shared/function.random-range.js";
import { gpuDataSystem } from "./system.gpu-data-system.js";
import { gpuMovementSystem } from "./system.gpu-movement-system.js";

/** `MoreComplexSystem` as a GPU kernel: every tenth `thingy`, a new random direction, drawn from the data's generator. */
export const gpuMoreComplexSystem: System = System.create({ kernel: "gpu", components: { with: [position, velocity, gpuData] }, after: [gpuMovementSystem, gpuDataSystem] }, row => {
    const value = row[gpuData];
    if (value.thingy % 10 === 0) {
        const at = row[position];
        if (at.x > at.y) {
            const x = randomRange(value.rng, 3, 19);
            const y = randomRange(x.state, 0, 5);
            row[velocity] = { x: x.value - 10, y: y.value };
            row[gpuData] = { thingy: value.thingy, dingy: value.dingy, mingy: value.mingy, seed: value.seed, rng: y.state, numgy: value.numgy };
        }
        else {
            const x = randomRange(value.rng, 0, 5);
            const y = randomRange(x.state, 3, 19);
            row[velocity] = { x: x.value, y: y.value - 10 };
            row[gpuData] = { thingy: value.thingy, dingy: value.dingy, mingy: value.mingy, seed: value.seed, rng: y.state, numgy: value.numgy };
        }
    }
});
