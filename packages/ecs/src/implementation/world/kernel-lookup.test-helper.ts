// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from '../../interface/entity/entity.js';
import { System } from '../../interface/system/system.js';
import type { F32 } from '../../interface/math/index.js';

/** A kernel whose lookup reads a value outside linear memory, which `System.create` rejects as this module runs. */

const target = Symbol("kernelLookupTest/target");
const label = Symbol("kernelLookupTest/label");
const offset = Symbol("kernelLookupTest/offset");
declare module "@adobe/ecs" {
    export interface Components {
        [target]: { type: Entity };
        [label]: { type: string };
        [offset]: { type: F32 };
    }
}

export const labels = System.create({
    kernel: true,
    components: { with: [target, offset] },
    lookup: { named: { with: [label] } },
}, (row, { lookup: { named } }) => {
    const found = named(row[target]);
    row[offset] = found === null ? 0 : +found[label];
});
