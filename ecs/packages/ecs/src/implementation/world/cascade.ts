// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Archetype } from './archetype.js';
import { readCell } from './cells.js';
import { generationOf, indexOf, locate } from './entities.js';
import { commandValue, isMissing } from './sync-systems.js';
import { createHolders, fitHolders, forEachHolder, linkHolder, unlinkHolder } from './holders.js';
import { closureOf, owner } from './structure.js';
import { archetypeOf, withoutComponent, type State } from './state.js';
import type { Queued } from './synchronize.js';

/**
 * A reference value written in this sync point to check: by spawn or add commands, or of a row spawned that `linkBorn`
 * leaves to the cascade. `holder`, `component` and `target` triples, checked once the plan's despawns are known.
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
 * Links each reference the rows spawned in this sync point hold to its target, before the cascade, so a target it
 * despawns finds them as it finds any holder. One naming an entity that won't be alive isn't linked, and goes to
 * `written` to cascade, as does every reference of a row a command touched, which the command may point elsewhere.
 * The rows spawned into an archetype are those from `first`, by archetype id; an entity is one f64.
 */
export const linkBorn = (state: State, born: ReadonlyMap<number, number>, written: Written, tick: number): void => {
    const { plan, structure, archetypes, entities, referencesWritten } = state;
    const { slots } = plan;
    for (const [id, first] of born) {
        const archetype = archetypes[id];
        const { count } = archetype;
        if (first >= count) continue;
        const rows = archetype.entities;
        for (const component of structure.referenceIds) {
            const storage = archetype.storageById[component];
            if (storage === undefined) continue;
            referencesWritten[component] = tick;
            const lists = structure.holders[component] ??= createHolders();
            fitHolders(lists, entities.length);
            const { unitStride, unitOffset } = storage;
            const values = storage.views.f64;
            // `aliveAfter`, through locals, since it runs for each row spawned.
            const { archetype: archetypeOfIndex, generation, length } = entities;
            const { entity: planned, despawned } = plan;
            for (let row = first; row < count; row++) {
                const target = values[row * unitStride + unitOffset];
                if (target === 0) continue;
                const holder = rows[row];
                const index = indexOf(holder);
                const commanded = index < slots.length && slots[index] >= 0;
                const into = indexOf(target);
                const entry = into < slots.length ? slots[into] : -1;
                const alive = entry >= 0 && planned[entry] === target ? despawned[entry] === 0
                    : into < length && archetypeOfIndex[into] >= 0 && generation[into] === generationOf(target);
                if (alive) linkHolder(lists, target, holder);
                if (commanded || !alive) written.push(holder, component, target);
            }
        }
    }
};

/**
 * Despawns the holders that own a reference to an entity that is despawned or never lives, and removes `weak`
 * references to one, transitively, before derivations close the plan. A holder acts only if its value once the plan applies
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
        plan.to[entry] = closureOf(structure, state.derived, to, (components, shared) => archetypeOf(state, components, shared), archetypes).id;
    };
    let checked = 0;
    for (let next = 0; next < despawned.length || checked < written.length;) {
        for (; next < despawned.length; next++) {
            const target = despawned[next];
            for (const component of structure.referenceIds) {
                const lists = structure.holders[component];
                if (lists === undefined) continue;
                forEachHolder(lists, target, holder => {
                    if (finalValue(state, queued, holder, component) === target) act(holder, component);
                });
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

/**
 * The changes the plan makes to the holder index, read before it applies, while old and new values are both readable:
 * `remove` and `add` as target, holder, component triples. A despawned target's holders each have a removal of their
 * own, since every reference component despawns its holders or drops the reference.
 */
export type IndexChanges = { readonly remove: number[]; readonly add: number[] };

export const indexChangesOf = (state: State, queued: readonly Queued[], fromOf: (entry: number) => Archetype | null): IndexChanges => {
    const { plan, structure, entities } = state;
    const changes: IndexChanges = { remove: [], add: [] };
    for (let entry = 0; entry < plan.count; entry++) {
        const holder = plan.entity[entry];
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
    return changes;
};

/** Applies index changes after the plan applies. */
export const applyIndexChanges = (state: State, changes: IndexChanges): void => {
    const { holders } = state.structure;
    const { remove, add } = changes;
    for (let c = 0; c < remove.length; c += 3) {
        const lists = holders[remove[c + 2]];
        if (lists !== undefined) unlinkHolder(lists, remove[c], remove[c + 1]);
    }
    const length = state.entities.length;
    for (let c = 0; c < add.length; c += 3) {
        const component = add[c + 2];
        const lists = holders[component] ??= createHolders();
        fitHolders(lists, length);
        linkHolder(lists, add[c], add[c + 1]);
    }
};
