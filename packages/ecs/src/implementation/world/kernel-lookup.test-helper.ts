import { Component } from '../../interface/component/component.js';
import { Entity } from '../../interface/entity/entity.js';
import { System } from '../../interface/system/system.js';

/** A kernel whose lookup reads a value outside linear memory, which `System.create` rejects as this module runs. */

const target = Symbol("kernelLookupTest/target");
const label = Symbol("kernelLookupTest/label");
const offset = Symbol("kernelLookupTest/offset");
declare module "@adobe/ecs" {
    export interface Components {
        [target]: { type: Entity };
        [label]: { type: string };
        [offset]: { type: number };
    }
}
Component.register(target, { type: Entity.schema });
Component.register(label, { type: { type: "string" } });
Component.register(offset, { type: { type: "number", precision: 1 } });

export const labels = System.create({
    name: "kernelLookupTest/labels",
    kernel: "cpu",
    components: { read: [target], write: [offset] },
    // @ts-expect-error kernel lookups read linear values
    lookup: { named: { read: [label] } },
}, (row, { lookup: { named } }) => {
    const found = named(row[target]);
    row[offset] = found === null ? 0 : +found[label];
});
