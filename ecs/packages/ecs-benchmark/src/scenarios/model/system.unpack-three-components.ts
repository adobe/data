// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { data } from "./shared/component.data.js";
import { position } from "./shared/component.position.js";
import { target } from "./shared/component.target.js";
import { velocity } from "./shared/component.velocity.js";
import { checksum } from "./shared/resource.checksum.js";

/** `BM_UnpackThreeComponents`: components one and two, and `getOptionalComponentThree`, for each probe's entity. */
export const unpackThreeComponents: System = System.create({ kernel: true,     components: { with: [target] },
    lookup: { found: { with: [position, velocity], optional: [data] } },
}, (row, { lookup, reduce }) => {
    const found = lookup.found(row[target]);
    if (found === null) return;
    reduce[checksum](found[position].x + found[position].y + found[velocity].x + found[velocity].y);
    const three = found[data];
    if (three !== undefined) {
        reduce[checksum](three.thingy + three.dingy + (three.mingy ? 1 : 0) + three.seed + three.rng[0] + three.rng[1] + three.rng[2] + three.rng[3] + three.numgy);
    }
});
