import type { Leaf } from '../../system/leaf.js';
import { requireDefinition, type Definition } from '../../system/definition.js';
import type { Key } from './state.js';

/**
 * Leaves in run order, grouped into tiers. Leaves in one tier have no ordering path between them. `reductions` are the
 * resources its leaves reduce into, each with how many of them contribute.
 */
export type Schedule = { readonly tiers: readonly (readonly Leaf[])[]; readonly reductions: ReadonlyMap<Key, number> };

export const isLeaf = (system: Definition): system is Leaf => system.kind !== "composite";

/** Each system is an interval, from its start node to its end node. */
const start = (unit: number): number => 2 * unit;
const end = (unit: number): number => 2 * unit + 1;

type Graph = { readonly units: readonly Definition[]; readonly successors: readonly Set<number>[] };

/**
 * A leaf runs from its start to its end, and a composite spans its members. `after` and `before` order one system's end
 * before another's start, and `during` places a system inside another's span. The root's own constraints are ignored,
 * as are constraints naming systems outside it.
 */
const graphOf = (root: Definition): Graph => {
    const units: Definition[] = [];
    const members: (readonly number[])[] = [];
    const indexOf = new Map<Definition, number>();
    const named = new Map<string, number>();
    const visit = (system: Definition): number => {
        const known = indexOf.get(system);
        if (known !== undefined) return known;
        const { name } = system.declaration;
        if (named.has(name)) throw new Error(`Two different systems are named "${name}".`);
        const unit = units.push(system) - 1;
        indexOf.set(system, unit);
        named.set(name, unit);
        members[unit] = isLeaf(system) ? [] : system.declaration.systems.map(member => visit(requireDefinition(member)));
        return unit;
    };
    visit(root);
    const successors = units.flatMap(() => [new Set<number>(), new Set<number>()]);
    const resolve = (systems: readonly { readonly name: string }[] | undefined): readonly number[] =>
        (systems ?? []).flatMap(({ name }) => named.get(name) ?? []);
    units.forEach((system, unit) => {
        successors[start(unit)].add(end(unit));
        for (const member of members[unit]) {
            successors[start(unit)].add(start(member));
            successors[end(member)].add(end(unit));
        }
        if (system === root) return;
        const { before, after, during } = system.declaration;
        for (const other of resolve(after)) successors[end(other)].add(start(unit));
        for (const other of resolve(before)) successors[end(unit)].add(start(other));
        for (const other of resolve(during)) {
            successors[start(other)].add(start(unit));
            successors[end(unit)].add(end(other));
        }
    });
    return { units, successors };
};

/** Kahn's algorithm over nodes. Throws on a cycle. */
const topologicalOrder = ({ units, successors }: Graph): number[] => {
    const incoming = successors.map(() => 0);
    for (const next of successors) for (const node of next) incoming[node]++;
    const order: number[] = [];
    const ready = successors.map((_, node) => node).filter(node => incoming[node] === 0);
    while (ready.length > 0) {
        const node = ready.pop() ?? 0;
        order.push(node);
        for (const next of successors[node]) if (--incoming[next] === 0) ready.push(next);
    }
    if (order.length < successors.length) {
        const cyclic = units.filter((_, unit) => incoming[start(unit)] > 0 || incoming[end(unit)] > 0).map(system => `"${system.declaration.name}"`);
        throw new Error(`Ordering cycle between ${cyclic.join(", ")}.`);
    }
    return order;
};

/** `reach[a]` has bit `b` set when there's a path from node `a` to node `b`. */
const reachability = (order: readonly number[], successors: readonly Set<number>[]): Uint32Array[] => {
    const words = Math.ceil(order.length / 32);
    const reach = order.map(() => new Uint32Array(words));
    for (let i = order.length - 1; i >= 0; i--) {
        const node = order[i];
        for (const next of successors[node]) {
            reach[node][next >>> 5] |= 1 << (next & 31);
            for (let w = 0; w < words; w++) reach[node][w] |= reach[next][w];
        }
    }
    return reach;
};

const reaches = (reach: readonly Uint32Array[], from: number, to: number): boolean => (reach[from][to >>> 5] & (1 << (to & 31))) !== 0;

/** Whether one of two systems ends before the other starts. */
const ordered = (reach: readonly Uint32Array[], a: number, b: number): boolean => reaches(reach, end(a), start(b)) || reaches(reach, end(b), start(a));

/** Each node's tier: the most leaves on any path to it, so a leaf's tier is where it starts. */
const depthsOf = ({ units, successors }: Graph, order: readonly number[]): number[] => {
    const depth = successors.map(() => 0);
    for (const node of order) {
        const step = node % 2 === 0 && isLeaf(units[node >>> 1]) ? 1 : 0;
        for (const next of successors[node]) depth[next] = Math.max(depth[next], depth[node] + (next === node + 1 ? step : 0));
    }
    return depth;
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
    const graph = graphOf(system);
    const leaves = graph.units.flatMap((unit, index) => isLeaf(unit) ? [{ leaf: unit, unit: index }] : []);
    const accesses = leaves.map(({ leaf }) => accessOf(leaf));
    // Leaves that read a resource run after every leaf that reduces into it, so they read the finished fold.
    const reductions = new Map<Key, number>();
    accesses.forEach((access, contributor) => {
        for (const key of access.reduces) {
            reductions.set(key, (reductions.get(key) ?? 0) + 1);
            accesses.forEach((other, reader) => {
                if (reader !== contributor && other.reads.has(key)) graph.successors[end(leaves[contributor].unit)].add(start(leaves[reader].unit));
            });
        }
    });
    const order = topologicalOrder(graph);
    const reach = reachability(order, graph.successors);
    for (let a = 0; a < leaves.length; a++) {
        for (let b = a + 1; b < leaves.length; b++) {
            const key = conflictOf(accesses[a], accesses[b]);
            if (key !== undefined && !ordered(reach, leaves[a].unit, leaves[b].unit)) {
                throw new Error(`Systems "${leaves[a].leaf.declaration.name}" and "${leaves[b].leaf.declaration.name}" both access "${String(key)}" and one writes it; order them with before or after.`);
            }
        }
    }
    const depth = depthsOf(graph, order);
    const tiers: Leaf[][] = [];
    for (const { leaf, unit } of leaves) (tiers[depth[start(unit)]] ??= []).push(leaf);
    return { tiers: tiers.filter(tier => tier !== undefined), reductions };
};
