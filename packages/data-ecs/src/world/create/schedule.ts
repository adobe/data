import type { Composite } from '../../system/composite.js';
import type { Leaf } from '../../system/leaf.js';
import { requireDefinition, type Definition } from '../../system/definition.js';
import type { Key } from './state.js';

/**
 * Leaves in run order, grouped into tiers. Leaves in one tier have no ordering path between them. `reductions` are the
 * resources its leaves reduce into, each with how many of them contribute.
 */
export type Schedule = { readonly tiers: readonly (readonly Leaf[])[]; readonly reductions: ReadonlyMap<Key, number> };

type Constraints = { readonly before: Set<string>; readonly after: Set<string>; readonly during: Set<string> };

type Entry = Constraints & { readonly leaf: Leaf };

export const isLeaf = (system: Definition): system is Leaf => system.kind !== "composite";

const add = (target: Set<string>, names: readonly string[] | undefined): void => {
    for (const name of names ?? []) target.add(name);
};

/** Walks a system, applying each composite's constraints to all its members. The root's own constraints are ignored. */
const flatten = (root: Definition): { readonly entries: readonly Entry[]; readonly expand: ReadonlyMap<string, readonly number[]> } => {
    const entries: Entry[] = [];
    const indexOf = new Map<Leaf, number>();
    const named = new Map<string, Definition>();
    const expand = new Map<string, number[]>();

    const visit = (system: Definition, inherited: readonly Constraints[]): readonly number[] => {
        const { name } = system.declaration;
        const existing = named.get(name);
        if (existing !== undefined && existing !== system) throw new Error(`Two different systems are named "${name}".`);
        named.set(name, system);
        const own: Constraints = { before: new Set(), after: new Set(), during: new Set() };
        if (system !== root) {
            add(own.before, system.declaration.before);
            add(own.after, system.declaration.after);
            add(own.during, system.declaration.during);
        }
        const constraints = [...inherited, own];
        const leaves = isLeaf(system) ? [visitLeaf(system, constraints)] : visitComposite(system, constraints);
        const expansion = expand.get(name) ?? [];
        for (const index of leaves) if (!expansion.includes(index)) expansion.push(index);
        expand.set(name, expansion);
        return leaves;
    };

    const visitLeaf = (leaf: Leaf, constraints: readonly Constraints[]): number => {
        let index = indexOf.get(leaf);
        if (index === undefined) {
            index = entries.length;
            indexOf.set(leaf, index);
            entries.push({ leaf, before: new Set(), after: new Set(), during: new Set() });
        }
        const entry = entries[index];
        for (const { before, after, during } of constraints) {
            for (const name of before) entry.before.add(name);
            for (const name of after) entry.after.add(name);
            for (const name of during) entry.during.add(name);
        }
        return index;
    };

    const visitComposite = (composite: Composite, constraints: readonly Constraints[]): readonly number[] =>
        composite.declaration.systems.flatMap(member => visit(requireDefinition(member), constraints));

    visit(root, []);
    return { entries, expand };
};

type Graph = { readonly successors: readonly Set<number>[]; readonly during: readonly Set<number>[] };

const graphOf = (entries: readonly Entry[], expand: ReadonlyMap<string, readonly number[]>): Graph => {
    const successors = entries.map(() => new Set<number>());
    const during = entries.map(() => new Set<number>());
    entries.forEach((entry, index) => {
        for (const name of entry.after) for (const other of expand.get(name) ?? []) if (other !== index) successors[other].add(index);
        for (const name of entry.before) for (const other of expand.get(name) ?? []) if (other !== index) successors[index].add(other);
        for (const name of entry.during) for (const other of expand.get(name) ?? []) if (other !== index) { during[index].add(other); during[other].add(index); }
    });
    return { successors, during };
};

/** Kahn's algorithm in flatten order. Throws on a cycle. */
const topologicalOrder = (entries: readonly Entry[], successors: readonly Set<number>[]): number[] => {
    const incoming = entries.map(() => 0);
    for (const next of successors) for (const index of next) incoming[index]++;
    const order: number[] = [];
    const ready = entries.map((_, index) => index).filter(index => incoming[index] === 0);
    while (ready.length > 0) {
        ready.sort((a, b) => b - a);
        const index = ready.pop() ?? 0;
        order.push(index);
        for (const next of successors[index]) if (--incoming[next] === 0) ready.push(next);
    }
    if (order.length < entries.length) {
        const cyclic = entries.filter((_, index) => incoming[index] > 0).map(entry => `"${entry.leaf.declaration.name}"`);
        throw new Error(`Ordering cycle between ${cyclic.join(", ")}.`);
    }
    return order;
};

/** `reach[a]` has bit `b` set when there's an ordering path from `a` to `b`. */
const reachability = (order: readonly number[], successors: readonly Set<number>[]): Uint32Array[] => {
    const words = Math.ceil(order.length / 32);
    const reach = order.map(() => new Uint32Array(words));
    for (let i = order.length - 1; i >= 0; i--) {
        const index = order[i];
        for (const next of successors[index]) {
            reach[index][next >>> 5] |= 1 << (next & 31);
            for (let w = 0; w < words; w++) reach[index][w] |= reach[next][w];
        }
    }
    return reach;
};

const reaches = (reach: readonly Uint32Array[], from: number, to: number): boolean => (reach[from][to >>> 5] & (1 << (to & 31))) !== 0;

/** Longest-path tiers, then `during` pairs pulled into the same tier where no ordering path separates them. */
const tiersOf = (order: readonly number[], graph: Graph, reach: readonly Uint32Array[]): number[] => {
    const tier = order.map(() => 0);
    const propagate = (): void => {
        for (const index of order) for (const next of graph.successors[index]) tier[next] = Math.max(tier[next], tier[index] + 1);
    };
    propagate();
    for (let pass = 0; pass < order.length; pass++) {
        let changed = false;
        for (const index of order) {
            for (const other of graph.during[index]) {
                if (tier[other] > tier[index] && !reaches(reach, index, other) && !reaches(reach, other, index)) {
                    tier[index] = tier[other];
                    changed = true;
                }
            }
        }
        if (!changed) break;
        propagate();
    }
    return tier;
};

type Access = { readonly reads: ReadonlySet<Key>; readonly writes: ReadonlySet<Key>; readonly reduces: ReadonlySet<Key> };

/** The resources a leaf reduces into. */
export const reducedBy = (leaf: Leaf): readonly Key[] => {
    const { reduce } = leaf.declaration;
    return reduce === undefined ? [] : Reflect.ownKeys(reduce).filter(key => Reflect.get(reduce, key) !== undefined);
};

/** Reads include change filters, since they observe writers' ticks. Presence-only lists don't conflict. */
export const accessOf = (leaf: Leaf): Access => {
    const { components, lookup, resources } = leaf.declaration;
    const reads = new Set<Key>([...components?.read ?? [], ...components?.added ?? [], ...components?.changed ?? [], ...resources?.read ?? [], ...resources?.changed ?? []]);
    for (const name in lookup) for (const key of lookup[name].read ?? []) reads.add(key);
    const writes = new Set<Key>([...components?.write ?? [], ...resources?.write ?? []]);
    return { reads, writes, reduces: new Set(reducedBy(leaf)) };
};

/** Contributors to one resource don't conflict with each other: their fold doesn't depend on which runs first. */
const conflictOf = (a: Access, b: Access): Key | undefined => {
    for (const key of a.writes) if (b.writes.has(key) || b.reads.has(key) || b.reduces.has(key)) return key;
    for (const key of b.writes) if (a.reads.has(key) || a.reduces.has(key)) return key;
    return undefined;
};

/** Throws if a leaf's lookup reads a component it writes. */
export const checkLeaf = (leaf: Leaf): void => {
    const { name, components, lookup } = leaf.declaration;
    const writes = new Set<Key>(components?.write);
    for (const lookupName in lookup) {
        for (const key of lookup[lookupName].read ?? []) {
            if (writes.has(key)) throw new Error(`System "${name}": lookup "${lookupName}" reads "${String(key)}", which the system writes.`);
        }
    }
};

const schedules = new WeakMap<Definition, Schedule>();

/** A system's schedule, created once per system. Throws on a cycle, or on two conflicting leaves with no ordering path between them. */
export const scheduleOf = (system: Definition): Schedule => {
    let schedule = schedules.get(system);
    if (schedule === undefined) schedules.set(system, schedule = createSchedule(system));
    return schedule;
};

/** Orders a system's leaves into tiers. Throws on a cycle, or on two conflicting leaves with no ordering path between them. */
const createSchedule = (system: Definition): Schedule => {
    const { entries, expand } = flatten(system);
    const graph = graphOf(entries, expand);
    const accesses = entries.map(entry => accessOf(entry.leaf));
    // Leaves that read a resource run after every leaf that reduces into it, so they read the finished fold.
    const reductions = new Map<Key, number>();
    accesses.forEach((access, contributor) => {
        for (const key of access.reduces) {
            reductions.set(key, (reductions.get(key) ?? 0) + 1);
            accesses.forEach((other, reader) => { if (reader !== contributor && other.reads.has(key)) graph.successors[contributor].add(reader); });
        }
    });
    const order = topologicalOrder(entries, graph.successors);
    const reach = reachability(order, graph.successors);
    for (let a = 0; a < entries.length; a++) {
        for (let b = a + 1; b < entries.length; b++) {
            const key = conflictOf(accesses[a], accesses[b]);
            if (key !== undefined && !reaches(reach, a, b) && !reaches(reach, b, a)) {
                throw new Error(`Systems "${entries[a].leaf.declaration.name}" and "${entries[b].leaf.declaration.name}" both access "${String(key)}" and one writes it; order them with before or after.`);
            }
        }
    }
    const tier = tiersOf(order, graph, reach);
    const tiers: Leaf[][] = [];
    entries.forEach((entry, index) => (tiers[tier[index]] ??= []).push(entry.leaf));
    return { tiers: tiers.filter(leaves => leaves !== undefined), reductions };
};
