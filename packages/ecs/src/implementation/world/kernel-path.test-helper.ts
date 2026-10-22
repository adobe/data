// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../../interface/component/component.js';
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
Component.register(pair, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
Component.register(sum, { type: { type: "number" } });

export const beyond = System.create({ name: "kernelPathTest/beyond", kernel: "cpu", components: { read: [pair], write: [sum] } }, row => {
    // @ts-expect-error a pair has no third item
    row[sum] = row[pair][2];
});
