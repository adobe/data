// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Resource } from '../resource/resource.js';
import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { System } from './system.js';
import type { Create } from '../world/create.js';
import type { World } from '../world/world.js';
import type { Plugin } from '../plugin/plugin.js';
import type { Essential } from '../component/value.js';
import type { ChangeSet } from './sync-system-body.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const source = Symbol("syncSystemsTypeTest/source");
const hidden = Symbol("syncSystemsTypeTest/hidden");
const slot = Symbol("syncSystemsTypeTest/slot");
const parent = Symbol("syncSystemsTypeTest/parent");
const time = Symbol("syncSystemsTypeTest/time");
const inDocument = Symbol("syncSystemsTypeTest/inDocument");
const kept = Symbol("syncSystemsTypeTest/kept");
const saved = Symbol("syncSystemsTypeTest/saved");

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

// A removed system's context holds every resource, the lookups it declares, and its commands.
const other = System.removed({ components: { with: [source] } }, (_, context) => {
    void context.resources;
    // @ts-expect-error no lookups declared
    void context.lookup;
    void context.commands;
});

// Removed systems read the stopping row; it's read-only.
System.removed({
    components: { with: [slot, parent], not: [hidden] },
    after: [other],
}, (row, { resources, commands }) => {
    const value: number = row[slot];
    const target: Entity = row[parent];
    const now: number = resources[time];
    commands.despawn(target);
    // @ts-expect-error a removed system's row is read-only
    row[slot] = 1;
    // @ts-expect-error only what with requires is in the row
    void row[source];
    void value; void now;
});
System.removed({
    components: {},
}, () => {});

// Changes systems see only the essential components they watch.
System.changes({ watch: [source, parent] }, (changes, { commands }) => {
    check<Equal<typeof changes, ChangeSet<typeof source | typeof parent>>>();
    void commands;
    check<Equal<typeof changes.written, readonly (typeof source | typeof parent)[]>>();
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
// @ts-expect-error changes systems don't watch derived components
System.changes({ watch: [slot] }, () => {});

// A trait of your own watches every component and resource declaring it.
System.changes({ watch: [inDocument, source] }, changes => {
    check<Equal<typeof changes, ChangeSet<typeof kept | typeof source, typeof saved>>>();
    // Those written through rows, by key or by trait.
    check<Equal<typeof changes.written, readonly (typeof kept | typeof source)[]>>();
});
// Every component, and the resources chosen, by key or trait.
System.changes({ watch: { components: true, resources: [time, inDocument] } }, changes => {
    check<Equal<typeof changes, ChangeSet<Essential, typeof time | typeof saved>>>();
});
System.changes({ watch: { components: [inDocument], resources: [] } }, changes => {
    check<Equal<typeof changes, ChangeSet<typeof kept>>>();
});
// @ts-expect-error components lists components and traits, resources resources and traits
System.changes({ watch: { components: [time], resources: [source] } }, () => {});

// Changes and removed systems are systems `run` never takes: added, they run in sync points.
check<Equal<typeof other, System<never>>>();
const unnamedChanges = System.changes({ watch: [source] }, changes => { void changes.groups; });
check<Equal<typeof unnamedChanges, System<never>>>();
const tick = System.create({}, () => {});
declare const create: Create;
const world: World = create();
world.add(other);
world.add(unnamedChanges);
world.remove(other);
// @ts-expect-error run doesn't take a removed system
void world.run(other);
// @ts-expect-error nor a changes system
void world.run(unnamedChanges);
// @ts-expect-error nor with its changes
void world.run(other, { changes: true });

// A composite holding one is added, as a resource's release is paired with what creates it, and never run.
const paired = System.create([tick, other]);
check<Equal<typeof paired, System<never>>>();
const declared = System.create({ systems: [tick, unnamedChanges] });
check<Equal<typeof declared, System<never>>>();
const nested = System.create([System.create([tick]), paired]);
check<Equal<typeof nested, System<never>>>();
world.add(paired);
world.add(nested);
world.remove(paired);
// @ts-expect-error run doesn't take a composite holding a removed system
void world.run(paired);
// @ts-expect-error nor a composite holding one within another
void world.run(nested);
const plugin: Plugin = { systems: [tick, other, paired] };
void plugin;

// Changes and removed systems are ordered only with each other.
System.removed({ components: { with: [source] }, before: [other], after: [unnamedChanges] }, () => {});
// @ts-expect-error a removed system isn't ordered with a tick system
System.removed({ components: { with: [source] }, after: [tick] }, () => {});
// @ts-expect-error nor a changes system
System.changes({ watch: [source], before: [tick] }, () => {});
// @ts-expect-error nor a tick system with a removed system
System.create({ after: [other] }, () => {});
// @ts-expect-error nor a composite with a changes system
System.create({ systems: [tick], before: [unnamedChanges] });
