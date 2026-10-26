// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { System } from './system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const local = Symbol("upTypeTest/local");
const world = Symbol("upTypeTest/world");
const parent = Symbol("upTypeTest/parent");
const name = Symbol("upTypeTest/name");

declare module '@adobe/ecs' {
    export interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [name]: { type: string };
    }
}

// `up` holds the values of the entity `through` names, or null for a row without one; it may read what the system
// writes. What the body reads of it the build infers.
System.create({
    kernel: true,
    components: { with: [local, world] },
    up: { through: parent },
}, (row, { up }) => {
    if (up !== null) check<Equal<typeof up[typeof world], number>>();
    row[world] = up === null ? row[local] : up[world] + row[local];
    // @ts-expect-error up's values are read-only
    if (up !== null) up[world] = 0;
});

// Without `up`, the context has none.
System.create({ components: { with: [local] } }, (row, context) => {
    void row[local];
    // @ts-expect-error no up declared
    void context.up;
});

System.create({
    components: { with: [world] },
    // @ts-expect-error through is a reference component
    up: { through: local },
}, () => {});



// A GPU kernel reads up too.
System.create({
    kernel: "gpu",
    components: { with: [local, world] },
    up: { through: parent },
}, (row, { up }) => {
    row[world] = up === null ? row[local] : up[world] + row[local];
});

System.create({
    // @ts-expect-error up orders rows, so it needs components
    up: { through: parent },
}, () => {});

// An observer system reads what a sync point left, in no order.
// @ts-expect-error an observer system has no up
System.create({ observer: true, components: { with: [local] }, up: { through: parent } }, () => {});
