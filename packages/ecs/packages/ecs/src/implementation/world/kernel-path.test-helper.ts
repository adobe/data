// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '../../interface/system/system.js';

/** A kernel reading a leaf its component's schema doesn't have, which registering its compiled kernel rejects as this module runs. */

const pair = Symbol("kernelPathTest/pair");
const sum = Symbol("kernelPathTest/sum");
declare module "@adobe/ecs" {
    export interface Components {
        [pair]: { type: readonly [number, number] };
        [sum]: { type: number };
    }
}

export const beyond = System.create({ kernel: true, components: { with: [pair, sum] } }, row => {
    // @ts-expect-error a pair has no third item
    row[sum] = row[pair][2];
});
