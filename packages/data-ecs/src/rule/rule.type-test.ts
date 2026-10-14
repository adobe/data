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
const slots = Rule.create({ name: "ruleTypeTest/slots", components: { has: [source], not: [hidden] }, derive: [slot] });
// @ts-expect-error a rule derives only derived components
Rule.create({ name: "ruleTypeTest/slots", components: { has: [source] }, derive: [source] });

// Per-query finalizers read the stopping row; it's read-only.
const release = Finalizer.create({
    name: "ruleTypeTest/release",
    components: { read: [slot, parent], not: [hidden] },
    resources: { read: [time] },
    after: ["ruleTypeTest/other"],
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
// A finalizer's context holds only what it declares, and its commands.
Finalizer.create({ name: "ruleTypeTest/other", components: { read: [source] } }, (_, context) => {
    // @ts-expect-error no resources declared
    void context.resources;
    // @ts-expect-error no lookups declared
    void context.lookup;
    void context.commands;
});
Finalizer.create({
    name: "ruleTypeTest/other",
    components: {},
    // @ts-expect-error write already makes a resource readable
    resources: { read: [time], write: [time] },
}, () => {});
// @ts-expect-error a finalizer can't order itself
Finalizer.create({ name: "ruleTypeTest/other", components: {}, before: ["ruleTypeTest/other"] }, () => {});

// Changes finalizers see only the essential components they watch.
const save = Finalizer.changes({ name: "ruleTypeTest/save", watch: [source, parent] }, (changes, { commands }) => {
    check<Equal<typeof changes, Finalizer.ChangeSet<typeof source | typeof parent>>>();
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
check<Equal<Extract<Component.Writable, typeof parent | typeof source>, typeof source>>();

// Each value says what it is.
check<Equal<typeof slots.kind, "rule">>();
check<Equal<typeof release.kind, "finalizer">>();
check<Equal<typeof save, Finalizer.Changes<typeof save.declaration>>>();

// Worlds register systems, rules and finalizers together.
export const created: Promise<World> = World.create({ systems: [slots, release, save] });
