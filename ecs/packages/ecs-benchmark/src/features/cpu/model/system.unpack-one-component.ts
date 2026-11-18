// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position, target } from "../../../model/index.js";
import { checksum } from "./internal/resource.checksum.js";

/** `BM_UnpackOneComponent`: `getComponentOne` for each probe's entity. */
export const unpackOneComponent: System = System.create({ kernel: true,     components: { with: [target] },
    lookup: { found: { with: [position] } },
}, (row, { lookup, reduce }) => {
    const found = lookup.found(row[target]);
    if (found !== null) reduce[checksum](found[position].x + found[position].y);
});
