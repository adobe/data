// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from '../../interface/entity/entity.js';
import { System } from '../../interface/system/system.js';
import type { F32 } from '../../interface/math/index.js';

/** Systems without a kernel flag: one that compiles, and one whose lookup reads a string, which runs as written. */

const target = Symbol("kernelTriedTest/target");
const label = Symbol("kernelTriedTest/label");
const offset = Symbol("kernelTriedTest/offset");
declare module "@adobe/ecs" {
    export interface Components {
        [target]: { type: Entity };
        [label]: { type: string };
        [offset]: { type: F32 };
    }
}

export const doubled = System.create({ components: { write: [offset] } }, row => {
    row[offset] = row[offset] * 2;
});

export const labels = System.create({
    components: { read: [target], write: [offset] },
    lookup: { named: { read: [label] } },
}, (row, { lookup: { named } }) => {
    const found = named(row[target]);
    row[offset] = found === null ? 0 : found[label].length;
});

export { label, offset, target };
