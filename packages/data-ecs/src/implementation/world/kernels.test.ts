import { describe, expect, it } from "vitest";
import { Component } from "../../types/component/component.js";
import { Resource } from "../../types/resource/resource.js";
import { System } from "../../types/system/system.js";
import { World } from "../../types/world/world.js";
import { definitionOf } from "../../types/registry/index.js";
import { attachKernel } from "./attach-kernel.js";
import { bindKernel } from "./kernels.js";
import type { KernelDescription } from "./kernel.js";
import { createState } from "./state.js";

const value = "kernelsTest/value";
const other = "kernelsTest/other";
const scale = "kernelsTest/scale";

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
        [other]: { type: number };
    }
    export interface Resources {
        [scale]: { type: number };
    }
}

Component.register(value, { type: { type: "number" } });
Component.register(other, { type: { type: "number" } });
Resource.register(scale, { type: { type: "number", default: 1 } });

/** Reads `value` and `other`, writes nothing, reads no resources. */
const system = System.create({ name: "kernelsTest/read", kernel: "cpu", components: { read: [value, other] } }, row => {
    if (row[value] > row[other]) return;
});

const spawn = System.create({ name: "kernelsTest/spawn" }, ({ commands }) => { commands.spawn({ [value]: 3, [other]: 0 }); });
const double = System.create({ name: "kernelsTest/double", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] * 2;
});

const describing = (overrides: Partial<KernelDescription>): KernelDescription =>
    ({ columns: [], shapes: [], resources: [], lookups: [], keys: [], url: "unused", program: null, reductions: [], reducedShapes: [], ...overrides });

const bind = (overrides: Partial<KernelDescription>): void => {
    const definition = definitionOf(attachKernel(system, describing(overrides)));
    if (definition === undefined || definition.kind === "composite") throw new Error("not a leaf");
    bindKernel(createState(), definition, describing(overrides));
};

describe("bindKernel", () => {
    it("rejects a kernel reading a resource the system doesn't declare", () => {
        expect(() => bind({ resources: [scale] })).toThrow('reads resource "kernelsTest/scale"');
    });
    it("rejects a changed column for a component the system only reads", () => {
        expect(() => bind({ columns: [{ kind: "changed", component: value }] })).toThrow("isn't in its components' write");
    });
    it("rejects a whole-value write of a component the system only reads", () => {
        expect(() => bind({ shapes: [{ component: value, leaves: [[]] }] })).toThrow("isn't in its components' write");
    });
});
