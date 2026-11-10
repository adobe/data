// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { data } from "../shared/component.data.js";
import { position } from "../shared/component.position.js";
import { velocity } from "../shared/component.velocity.js";
import { randomRange } from "../shared/function.random-range.js";
import { dataSystem } from "./system.data-system.js";
import { movementSystem } from "./system.movement-system.js";

/** `MoreComplexSystem`: every tenth `thingy`, a new random direction, drawn from the data's generator. */
export const moreComplexSystem: System = System.create({ kernel: true, components: { with: [position, velocity, data] }, after: [movementSystem, dataSystem] }, row => {
    const value = row[data];
    if (value.thingy % 10 === 0) {
        const at = row[position];
        if (at.x > at.y) {
            const x = randomRange(value.rng, 3, 19);
            const y = randomRange(x.state, 0, 5);
            row[velocity] = { x: x.value - 10, y: y.value };
            row[data] = { thingy: value.thingy, dingy: value.dingy, mingy: value.mingy, seed: value.seed, rng: y.state, numgy: value.numgy };
        }
        else {
            const x = randomRange(value.rng, 0, 5);
            const y = randomRange(x.state, 3, 19);
            row[velocity] = { x: x.value, y: y.value - 10 };
            row[data] = { thingy: value.thingy, dingy: value.dingy, mingy: value.mingy, seed: value.seed, rng: y.state, numgy: value.numgy };
        }
    }
});
