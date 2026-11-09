// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "./shared/component.position.js";
import { target } from "./shared/component.target.js";
import { checksum } from "./shared/resource.checksum.js";

/** `BM_UnpackOneComponent`: `getComponentOne` for each probe's entity. */
export const unpackOneComponent: System = System.create({ kernel: true,     components: { with: [target] },
    lookup: { found: { with: [position] } },
}, (row, { lookup, reduce }) => {
    const found = lookup.found(row[target]);
    if (found !== null) reduce[checksum](found[position].x + found[position].y);
});
