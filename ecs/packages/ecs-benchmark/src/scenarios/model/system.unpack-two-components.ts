// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "./shared/component.position.js";
import { target } from "./shared/component.target.js";
import { velocity } from "./shared/component.velocity.js";
import { checksum } from "./shared/resource.checksum.js";

/** `BM_UnpackTwoComponents`: `getComponentOne` and `getComponentTwo` for each probe's entity. */
export const unpackTwoComponents: System = System.create({ kernel: true,     components: { with: [target] },
    lookup: { found: { with: [position, velocity] } },
}, (row, { lookup, reduce }) => {
    const found = lookup.found(row[target]);
    if (found !== null) reduce[checksum](found[position].x + found[position].y + found[velocity].x + found[velocity].y);
});
