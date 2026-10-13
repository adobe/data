import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Resource } from "../../resource/resource.js";
import { System } from "../../system/system.js";
import { attachKernel } from "./attach-kernel.js";
import { bindKernel } from "./kernels.js";
import type { KernelDescription } from "./kernel.js";
import { createState } from "./state.js";

const value = "kernelsTest/value";
const other = "kernelsTest/other";
const scale = "kernelsTest/scale";

declare module "../../component/types.js" {
    export interface Types {
        [value]: number;
        [other]: number;
    }
}
declare module "../../resource/types.js" {
    export interface Types {
        [scale]: number;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "kernelsTest/read": true;
    }
}

Component.register(value, { type: "number" });
Component.register(other, { type: "number" });
Resource.register(scale, { type: "number", default: 1 });

/** Reads `value` and `other`, writes nothing, reads no resources. */
const system = System.create({ name: "kernelsTest/read", kernel: "cpu", query: { read: [value, other] } }, row => {
    if (row[value] > row[other]) return;
});

const describing = (overrides: Partial<KernelDescription>): KernelDescription =>
    ({ columns: [], shapes: [], resources: [], lookups: [], keys: [], url: "unused", program: null, reductions: [], reducedShapes: [], ...overrides });

const bind = (overrides: Partial<KernelDescription>): void => {
    bindKernel(createState(), attachKernel(system, describing(overrides)), describing(overrides));
};

describe("bindKernel", () => {
    it("rejects a kernel reading a resource the system doesn't declare", () => {
        expect(() => bind({ resources: [scale] })).toThrow('reads resource "kernelsTest/scale"');
    });
    it("rejects a changed column for a component the system only reads", () => {
        expect(() => bind({ columns: [{ kind: "changed", component: value }] })).toThrow("isn't in the query's write");
    });
    it("rejects a whole-value write of a component the system only reads", () => {
        expect(() => bind({ shapes: [{ component: value, leaves: [[]] }] })).toThrow("isn't in the query's write");
    });
});
