import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { Finalizer } from '../finalizer/finalizer.js';
import { System } from '../system/system.js';
import type { World } from '../world/world.js';
import { Rule } from './rule.js';
import type { Writable } from '../component/value.js';
import type { ChangeSet } from '../finalizer/body.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const source = "ruleTypeTest/source";
const hidden = "ruleTypeTest/hidden";
const slot = "ruleTypeTest/slot";
const parent = "ruleTypeTest/parent";
const time = "ruleTypeTest/time";

declare module '@adobe/data-ecs' {
    export interface Components {
        [source]: { type: number };
        [hidden]: { type: true };
        [slot]: { type: number; derived: true };
        [parent]: { type: Entity; reference: "owner" };
    }
    export interface Resources {
        [time]: { type: number };
    }
}

// Rules derive only derived components.
Rule.create({ name: "ruleTypeTest/slots", components: { has: [source], not: [hidden] }, derive: [slot] });
// @ts-expect-error a rule derives only derived components
Rule.create({ name: "ruleTypeTest/slots", components: { has: [source] }, derive: [source] });

// A finalizer's context holds only what it declares, and its commands.
const other = Finalizer.create({ name: "ruleTypeTest/other", components: { read: [source] } }, (_, context) => {
    // @ts-expect-error no resources declared
    void context.resources;
    // @ts-expect-error no lookups declared
    void context.lookup;
    void context.commands;
});

// Per-query finalizers read the stopping row; it's read-only.
Finalizer.create({
    name: "ruleTypeTest/release",
    components: { read: [slot, parent], not: [hidden] },
    resources: { read: [time] },
    after: [other],
}, (row, { resources, commands }) => {
    const value: number = row[slot];
    const target: Entity = row[parent];
    const now: number = resources[time];
    commands.despawn(target);
    // @ts-expect-error a finalizer's row is read-only
    row[slot] = 1;
    // @ts-expect-error only declared reads are in the row
    void row[source];
    // @ts-expect-error read resources are read-only
    resources[time] = 0;
    void value; void now;
});
Finalizer.create({
    name: "ruleTypeTest/other",
    components: {},
    // @ts-expect-error write already makes a resource readable
    resources: { read: [time], write: [time] },
}, () => {});

// Changes finalizers see only the essential components they watch.
Finalizer.changes({ name: "ruleTypeTest/save", watch: [source, parent] }, (changes, { commands }) => {
    check<Equal<typeof changes, ChangeSet<typeof source | typeof parent>>>();
    void commands;
    for (const group of changes.groups) {
        check<Equal<typeof group.from, readonly (typeof source | typeof parent)[] | null>>();
        for (const entity of group.entities) {
            const before: number | null = changes.previous(entity, source);
            const after: Entity | null = changes.next(entity, parent);
            // @ts-expect-error only watched components
            changes.next(entity, hidden);
            void before; void after;
        }
    }
});
// @ts-expect-error changes finalizers don't watch derived components
Finalizer.changes({ name: "ruleTypeTest/save", watch: [slot] }, () => {});

// References change only through commands, so systems can't write them.
System.create({ name: "ruleTypeTest/move", components: { read: [parent], write: [source] } }, row => { row[source] = row[parent]; });
// @ts-expect-error a reference changes only through commands
System.create({ name: "ruleTypeTest/move", components: { write: [parent] } }, () => {});
check<Equal<Extract<Writable, typeof parent | typeof source>, typeof source>>();

// A rule returns nothing, since nothing references one; a finalizer is its name, for ordering others.
check<Equal<ReturnType<typeof Rule.create>, void>>();
check<Equal<typeof other, Finalizer>>();

// Rules and finalizers apply in every world.
declare const create: World.Create;
export const created: World = create();
