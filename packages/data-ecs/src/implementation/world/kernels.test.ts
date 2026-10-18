import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import { World } from "../../interface/world/world.js";
import { definitionOf } from "../../interface/registry/index.js";
import { attachKernel } from "./attach-kernel.js";
import { bindKernel } from "./kernels.js";
import type { KernelDescription } from "./kernel.js";
import { createState } from "./state.js";

const value = Symbol("kernelsTest/value");
const other = Symbol("kernelsTest/other");
const scale = Symbol("kernelsTest/scale");

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: typeof valueTraits;
        [other]: typeof otherTraits;
    }
    export interface Resources {
        [scale]: typeof scaleTraits;
    }
}

const valueTraits = Component.register(value, { type: { type: "number" } });
const otherTraits = Component.register(other, { type: { type: "number" } });
const scaleTraits = Resource.register(scale, { type: { type: "number", default: 1 } });

/** Reads `value` and `other`, writes nothing, reads no resources. */
const system = System.create({ name: "kernelsTest/read", kernel: "cpu", components: { read: [value, other] } }, row => {
    if (row[value] > row[other]) return;
});

const spawn = System.create({ name: "kernelsTest/spawn" }, ({ commands }) => { commands.spawn([value, other])({ [value]: 3, [other]: 0 }); });
const double = System.create({ name: "kernelsTest/double", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] * 2;
});

const describing = (overrides: Partial<KernelDescription>): KernelDescription =>
    ({ columns: [], shapes: [], resources: [], lookups: [], keys: [], spawns: [], url: "unused", program: null, reductions: [], reducedShapes: [], ...overrides });

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
    it("rejects a spawn list naming a component twice", () => {
        expect(() => bind({ keys: [value, other], spawns: [[0, 1], [1, 0, 1]] })).toThrow('spawns a list naming "kernelsTest/other" twice');
    });
});

describe("attachKernel", () => {
    it("rejects at registration a spawn site naming a component twice", () => {
        expect(() => attachKernel(system, describing({ keys: [value, other], spawns: [[1, 0, 1]] }))).toThrow('Kernel "kernelsTest/read": spawns a list naming "kernelsTest/other" twice.');
    });
    it("rejects at registration a spawn site naming a component outside its keys", () => {
        expect(() => attachKernel(system, describing({ keys: [value], spawns: [[0, 1]] }))).toThrow('Kernel "kernelsTest/read": spawns a list naming component 1 of its 1 keys.');
    });
});
