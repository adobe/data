import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { Finalizer } from '../finalizer/finalizer.js';
import { System } from '../system/system.js';
import { World } from '../world/world.js';
import { Rule } from './rule.js';

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
    export interface Rules {
        "ruleTypeTest/slots": true;
    }
    export interface Finalizers {
        "ruleTypeTest/release": true;
        "ruleTypeTest/save": true;
        "ruleTypeTest/other": true;
    }
    export interface Systems {
        "ruleTypeTest/move": true;
    }
}

// Rules derive only derived components.
const slots = Rule.create({ name: "ruleTypeTest/slots", query: { has: [source], not: [hidden] }, derives: [slot] });
// @ts-expect-error a rule derives only derived components
Rule.create({ name: "ruleTypeTest/slots", query: { has: [source] }, derives: [source] });

// Per-query finalizers read the stopping row; it's read-only.
const release = Finalizer.create({
    name: "ruleTypeTest/release",
    query: { read: [slot, parent], not: [hidden] },
    resources: { read: [time] },
    after: ["ruleTypeTest/other"],
}, (row, context, commands) => {
    const value: number = row[slot];
    const target: Entity = row[parent];
    const now: number = context[time];
    commands.despawn(target);
    // @ts-expect-error a finalizer's row is read-only
    row[slot] = 1;
    // @ts-expect-error only declared reads are in the row
    void row[source];
    // @ts-expect-error read resources are read-only
    context[time] = 0;
    void value; void now;
});
// @ts-expect-error a finalizer can't order itself
Finalizer.create({ name: "ruleTypeTest/other", query: {}, before: ["ruleTypeTest/other"] }, () => {});

// Changes finalizers see only the essential components they watch.
const save = Finalizer.changes({ name: "ruleTypeTest/save", components: [source, parent] }, changes => {
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
Finalizer.changes({ name: "ruleTypeTest/save", components: [slot] }, () => {});

// References change only through commands, so systems can't write them.
System.create({ name: "ruleTypeTest/move", query: { read: [parent], write: [source] } }, row => { row[source] = row[parent]; });
// @ts-expect-error a reference changes only through commands
System.create({ name: "ruleTypeTest/move", query: { write: [parent] } }, () => {});
check<Equal<Extract<Component.Writable, typeof parent | typeof source>, typeof source>>();

// Worlds register systems, rules and finalizers together.
export const created: Promise<World> = World.create({ systems: [slots, release, save] });
