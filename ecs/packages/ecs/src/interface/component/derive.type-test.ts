// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Resource } from '../resource/resource.js';
import { Component } from './component.js';
import { Entity } from '../entity/entity.js';
import { System } from '../system/system.js';
import type { Writable } from './value.js';
import type { ChangeSet } from '../system/sync-system-body.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const source = Symbol("deriveTypeTest/source");
const hidden = Symbol("deriveTypeTest/hidden");
const slot = Symbol("deriveTypeTest/slot");
const parent = Symbol("deriveTypeTest/parent");
const time = Symbol("deriveTypeTest/time");
const inDocument = Symbol("deriveTypeTest/inDocument");
const kept = Symbol("deriveTypeTest/kept");
const saved = Symbol("deriveTypeTest/saved");

declare module '@adobe/ecs' {
    export interface Components {
        [source]: { type: number };
        [hidden]: { type: true };
        [slot]: { type: number; derived: true };
        [parent]: { type: Entity; reference: "owner" };
        [kept]: { type: number; [inDocument]: true };
    }
    export interface Resources {
        [time]: { type: number };
        [saved]: { type: number; [inDocument]: true };
    }
    export interface Traits<N> {
        readonly [inDocument]: N extends unknown ? true : never;
    }
}

// Component.derive derives only derived components, and returns nothing.
const slots = Component.derive(slot, { from: [source], not: [hidden] });
check<Equal<typeof slots, void>>();
Component.derive(slot, { from: [source] });
Component.derive(slot, {});
// @ts-expect-error it derives only derived components
Component.derive(source, { from: [hidden] });
// @ts-expect-error from lists components
Component.derive(slot, { from: [time] });

// References change only through commands, so systems can't write them.
System.create({ components: { with: [parent, source] } }, row => { row[source] = row[parent]; });
System.create({ components: { with: [parent] } }, row => {
    // @ts-expect-error a reference changes only through commands
    row[parent] = row.entity;
});
check<Equal<Extract<Writable, typeof parent | typeof source>, typeof source>>();
