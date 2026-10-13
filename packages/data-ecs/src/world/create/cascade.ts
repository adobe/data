import type { Archetype } from './archetype.js';
import { readCell } from './cells.js';
import { indexOf, locate } from './entities.js';
import { commandValue, isMissing } from './finalizers.js';
import { closureOf, owner } from './structure.js';
import { archetypeOf, withoutComponent, type State } from './state.js';
import type { Queued } from './synchronize.js';

/**
 * A reference value written in this sync point: by spawn or add commands, or a batch spawn. `holder`, `component`
 * and `target` triples, checked once the plan's despawns are known.
 */
export type Written = number[];

/** The entry for a live entity, added unchanged if it has none; -1 for one that isn't alive or planned. */
export type EntryOf = (entity: number) => number;

/** The value an entity holds for `component` once the plan applies, or undefined if it won't hold one. */
const finalValue = (state: State, queued: readonly Queued[], holder: number, component: number): unknown => {
    const { plan, entities, archetypes } = state;
    const entry = plan.slots[indexOf(holder)] ?? -1;
    if (entry >= 0 && plan.entity[entry] === holder) {
        if (plan.despawned[entry] === 1 || archetypes[plan.to[entry]].storageById[component] === undefined) return undefined;
        const value = commandValue(state, queued, entry, component);
        if (!isMissing(value)) return value;
    }
    const index = locate(entities, holder);
    if (index < 0) return undefined;
    const storage = archetypes[entities.archetype[index]].storageById[component];
    return storage === undefined ? undefined : readCell(storage, entities.row[index]);
};

/** Whether `target` is alive once the plan applies: live or spawned here, and not despawned. */
const aliveAfter = (state: State, target: number): boolean => {
    const { plan, entities } = state;
    const index = indexOf(target);
    const entry = index < plan.slots.length ? plan.slots[index] : -1;
    if (entry >= 0 && plan.entity[entry] === target) return plan.despawned[entry] === 0;
    return locate(entities, target) >= 0;
};

/**
 * Despawns the holders that own a reference to an entity that is despawned or never lives, and removes `weak`
 * references to one, transitively, before rules close the plan. A holder acts only if its value once the plan applies
 * names the target, so a reference pointed elsewhere in the same sync point is left alone.
 */
export const cascadeReferences = (state: State, queued: readonly Queued[], written: Written, entryOf: EntryOf): void => {
    const { plan, structure, archetypes } = state;
    const despawned: number[] = [];
    for (let entry = 0; entry < plan.count; entry++) if (plan.despawned[entry] === 1) despawned.push(plan.entity[entry]);
    const act = (holder: number, component: number): void => {
        const entry = entryOf(holder);
        if (entry < 0 || plan.despawned[entry] === 1) return;
        if (structure.references[component] === owner) {
            plan.despawned[entry] = 1;
            despawned.push(holder);
            return;
        }
        const to = withoutComponent(state, archetypes[plan.to[entry]], component);
        plan.to[entry] = closureOf(structure, state.derived, to, components => archetypeOf(state, components), archetypes).id;
    };
    let checked = 0;
    for (let next = 0; next < despawned.length || checked < written.length;) {
        for (; next < despawned.length; next++) {
            const target = despawned[next];
            const holders = structure.holders.get(target);
            if (holders === undefined) continue;
            for (let h = 0; h < holders.length; h += 2) {
                if (finalValue(state, queued, holders[h], holders[h + 1]) === target) act(holders[h], holders[h + 1]);
            }
        }
        // A reference written here to an entity that won't be alive is as dangling as one whose target despawns.
        for (; checked < written.length; checked += 3) {
            const holder = written[checked];
            const component = written[checked + 1];
            const target = written[checked + 2];
            // `Entity.none` names no entity, so a reference to it isn't dangling.
            if (target !== 0 && finalValue(state, queued, holder, component) === target && !aliveAfter(state, target)) act(holder, component);
        }
    }
};

const unlink = (holders: Map<number, number[]>, target: number, holder: number, component: number): void => {
    const list = holders.get(target);
    if (list === undefined) return;
    for (let h = 0; h < list.length; h += 2) {
        if (list[h] !== holder || list[h + 1] !== component) continue;
        list.splice(h, 2);
        break;
    }
    if (list.length === 0) holders.delete(target);
};

const link = (holders: Map<number, number[]>, target: number, holder: number, component: number): void => {
    let list = holders.get(target);
    if (list === undefined) holders.set(target, list = []);
    list.push(holder, component);
};

/**
 * The changes the plan makes to the holder index, read before it applies, while old and new values are both readable:
 * `remove` and `add` as target, holder, component triples, and the despawned entities whose holder lists end.
 */
export type IndexChanges = { readonly remove: number[]; readonly add: number[]; readonly ended: number[] };

export const indexChangesOf = (state: State, queued: readonly Queued[], fromOf: (entry: number) => Archetype | null, bornRows: readonly (readonly [Archetype, number])[]): IndexChanges => {
    const { plan, structure, entities } = state;
    const changes: IndexChanges = { remove: [], add: [], ended: [] };
    for (let entry = 0; entry < plan.count; entry++) {
        const holder = plan.entity[entry];
        if (plan.despawned[entry] === 1) changes.ended.push(holder);
        const from = fromOf(entry);
        for (const component of structure.referenceIds) {
            const storage = from?.storageById[component];
            const before = storage === undefined ? undefined : readCell(storage, entities.row[indexOf(holder)]);
            const after = plan.despawned[entry] === 1 ? undefined : finalValue(state, queued, holder, component);
            if (before === after) continue;
            if (typeof before === "number" && before !== 0) changes.remove.push(before, holder, component);
            if (typeof after === "number" && after !== 0) changes.add.push(after, holder, component);
        }
    }
    // Batch spawns no command touched still hold the references they were spawned with.
    for (const [archetype, first] of bornRows) {
        for (const component of structure.referenceIds) {
            const storage = archetype.storageById[component];
            if (storage === undefined) continue;
            for (let row = first; row < archetype.count; row++) {
                const holder = archetype.entities[row];
                if ((plan.slots[indexOf(holder)] ?? -1) >= 0) continue;
                const value = readCell(storage, row);
                if (typeof value === "number" && value !== 0) changes.add.push(value, holder, component);
            }
        }
    }
    return changes;
};

/** Applies index changes after the plan applies. */
export const applyIndexChanges = (state: State, changes: IndexChanges): void => {
    const { holders } = state.structure;
    for (let c = 0; c < changes.remove.length; c += 3) unlink(holders, changes.remove[c], changes.remove[c + 1], changes.remove[c + 2]);
    for (const target of changes.ended) holders.delete(target);
    for (let c = 0; c < changes.add.length; c += 3) link(holders, changes.add[c], changes.add[c + 1], changes.add[c + 2]);
};
