// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from '../entity/entity.js';
import { System } from './system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const position = Symbol("optionalTest/position");
const velocity = Symbol("optionalTest/velocity");
const pilot = Symbol("optionalTest/pilot");

declare module '@adobe/ecs' {
    export interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
        [pilot]: { type: Entity; reference: "owner" };
    }
}

// An optional component is its value, or undefined where an entity lacks it.
System.create({ components: { with: [position], optional: [velocity, pilot] } }, row => {
    check<Equal<typeof row[typeof velocity], number | undefined>>();
    const speed = row[velocity];
    if (speed !== undefined) row[position] += speed;
    row[velocity] = 2;
    // @ts-expect-error a reference is read-only in a row, optional or not
    row[pilot] = Entity.none;
});

// A CPU kernel reads them as a body run as written does; GPU kernels don't read components an archetype may lack yet.
System.create({ kernel: true, components: { with: [position], optional: [velocity] } }, row => { void row[velocity]; });
System.create({
    // @ts-expect-error a GPU kernel can't have optional components yet
    kernel: "gpu",
    components: { with: [position], optional: [velocity] },
}, row => { void row[velocity]; });

// An observer system reads its optional components and writes nothing.
System.create({ observer: true, components: { with: [position], optional: [velocity] } }, row => {
    void row[velocity];
    // @ts-expect-error an observer system's row is read-only
    row[velocity] = 1;
});
