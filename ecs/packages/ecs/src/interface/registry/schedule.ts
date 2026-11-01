// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from '../schema/schema.js';
import type { Definition } from '../system/definition.js';
import type { Leaf } from '../system/leaf.js';
import { firstItemOf } from './items.js';
import { requireDefinition } from './program.js';
import { declarationOf, firstKeyOf, labelOf, sameDeclaration } from './names.js';
import { indexDefinitionOf, lookupKeysOf, orderKeysOf } from './indexes.js';

type Key = symbol;

/** Throws unless a field of the input several leaves take has one schema. */
const checkInputs = (leaves: readonly Leaf[]): void => {
    const fields = new Map<string, { readonly schema: Schema; readonly system: string }>();
    for (const leaf of leaves) {
        const { input } = leaf;
        const name = leaf.name;
        if (input === undefined) continue;
        for (const [field, property] of Object.entries(input.properties)) {
            const seen = fields.get(field);
            if (seen === undefined) fields.set(field, { schema: property, system: name });
            else if (!sameDeclaration(seen.schema, property)) {
                throw new Error(`Systems "${seen.system}" and "${name}" declare input field "${field}" with different schemas.`);
            }
        }
    }
};

/**
 * Leaves in run order, grouped into tiers. Leaves in one tier have no ordering path between them. `reductions` are the
 * resources its leaves reduce into, each with how many of them contribute. `observer` are its readonly leaves, in no
 * tier: they run after its sync point, ordered with nothing. `syncs` holds, after each tier, the reasons for a sync
 * point there, which applies the commands so far before the next tier, or null for none.
 */
export type Schedule = {
    readonly tiers: readonly (readonly Leaf[])[];
    readonly reductions: ReadonlyMap<Key, number>;
    readonly observer: readonly Leaf[];
    readonly syncs: readonly (readonly SyncReason[] | null)[];
};

export const isLeaf = (system: Definition): system is Leaf => system.kind !== "composite";

/** Whether a system is a readonly system leaf, which runs after a sync point rather than in a tier. */
export const isObserver = (system: Definition): system is Leaf & { readonly declaration: { readonly readonly: true } } => system.kind !== "composite" && system.declaration.readonly === true;

/** Each system is an interval, from its start node to its end node. */
const start = (unit: number): number => 2 * unit;
const end = (unit: number): number => 2 * unit + 1;

type Graph = {
    readonly units: readonly Definition[];
    readonly successors: readonly Set<number>[];
    /** Each unit's members, by unit: none for a leaf. */
    readonly members: readonly (readonly number[])[];
    /** The units a list of systems names, readonly systems left out. */
    readonly resolve: (systems: readonly object[] | undefined) => readonly number[];
};

/**
 * A leaf runs from its start to its end, and a composite spans its members. `after` and `before` order one system's end
 * before another's start, and `during` places a system inside another's span. The root's own constraints are ignored,
 * as are constraints naming systems outside it. Values of one system, as a module evaluated again makes them, are one
 * unit, the first reached.
 */
const graphOf = (root: Definition): Graph => {
    const units: Definition[] = [];
    const members: (readonly number[])[] = [];
    const indexOf = new Map<object, number>();
    const visit = (system: Definition): number => {
        const first = firstItemOf(system);
        const known = indexOf.get(first);
        if (known !== undefined) return known;
        const unit = units.push(system) - 1;
        indexOf.set(first, unit);
        members[unit] = isLeaf(system) ? [] : system.declaration.systems.map(member => visit(requireDefinition(member)));
        return unit;
    };
    visit(root);
    const successors = units.flatMap(() => [new Set<number>(), new Set<number>()]);
    // A readonly system is ordered with nothing, so constraints naming one are ignored.
    const resolve = (systems: readonly object[] | undefined): readonly number[] =>
        (systems ?? []).flatMap(system => {
            const unit = indexOf.get(firstItemOf(system));
            return unit === undefined || isObserver(units[unit]) ? [] : [unit];
        });
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
    return { units, successors, members, resolve };
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
        const cyclic = units.filter((_, unit) => incoming[start(unit)] > 0 || incoming[end(unit)] > 0).map(system => `"${system.name}"`);
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
        const step = node % 2 === 0 && isLeaf(units[node >>> 1]) && !isObserver(units[node >>> 1]) ? 1 : 0;
        for (const next of successors[node]) depth[next] = Math.max(depth[next], depth[node] + (next === node + 1 ? step : 0));
    }
    return depth;
};

type Access = { readonly reads: ReadonlySet<Key>; readonly writes: ReadonlySet<Key>; readonly reduces: ReadonlySet<Key> };

/** The resources a leaf reduces into. */
export const reducedBy = (leaf: Leaf): readonly Key[] => {
    return leaf.declaration.resources?.reduce ?? [];
};

/**
 * Reads include change filters, since they observe writers' ticks, and the key parts of indexes looked up through or
 * ordered by, which the index is found and kept by. Presence-only lists don't conflict. Keys are each one's first
 * symbol.
 */
export const accessOf = (leaf: Leaf): Access => {
    const { components, lookup, resources, up } = leaf.declaration;
    const reads = new Set<Key>([...components?.read ?? [], ...components?.added ?? [], ...components?.changed ?? [], ...resources?.read ?? [], ...resources?.changed ?? []].map(firstKeyOf));
    for (const name in lookup) for (const key of [...lookup[name].read ?? [], ...lookupKeysOf(lookup[name])]) reads.add(firstKeyOf(key));
    for (const key of orderKeysOf(leaf.declaration)) reads.add(firstKeyOf(key));
    if (up !== undefined) for (const key of [up.through, ...up.read ?? []]) reads.add(firstKeyOf(key));
    const writes = new Set<Key>([...components?.write ?? [], ...resources?.write ?? []].map(firstKeyOf));
    return { reads, writes, reduces: new Set(reducedBy(leaf).map(firstKeyOf)) };
};

/** Contributors to one resource don't conflict with each other: their fold doesn't depend on which runs first. */
const conflictOf = (a: Access, b: Access): Key | undefined => {
    for (const key of a.writes) if (b.writes.has(key) || b.reads.has(key) || b.reduces.has(key)) return key;
    for (const key of b.writes) if (a.reads.has(key) || a.reduces.has(key)) return key;
    return undefined;
};

/** Every key two accesses conflict on. */
const conflictsOf = (a: Access, b: Access): readonly Key[] => [...new Set([
    ...[...a.writes].filter(key => b.writes.has(key) || b.reads.has(key) || b.reduces.has(key)),
    ...[...b.writes].filter(key => a.reads.has(key) || a.reduces.has(key)),
])];

/** A system's leaves in its tiers, with their units and accesses, and its graph with readers of folds after their contributors. */
const orderedOf = (system: Definition) => {
    const graph = graphOf(system);
    const leaves = graph.units.flatMap((unit, index) => isLeaf(unit) && !isObserver(unit) ? [{ leaf: unit, unit: index }] : []);
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
    return { graph, leaves, accesses, reductions };
};

/**
 * What put a leaf after another: a constraint of either, or of a composite holding it, naming the other or a composite
 * holding it (`after`, `before`), its reading a fold the other contributes to (`reduction`), or being placed during a
 * span (`during`). `conflicts` are the keys both access, one writing, which need the order.
 */
export type Placement = { readonly leaf: Leaf; readonly because: "after" | "before" | "during" | "reduction"; readonly conflicts: readonly Key[] };

/**
 * For each leaf in a system's tiers, the leaves it follows directly: those with an ordering path to it through no other
 * leaf of its tiers.
 */
export const placementsOf = (system: Definition): ReadonlyMap<Leaf, readonly Placement[]> => {
    const { graph, leaves, accesses } = orderedOf(system);
    const reach = reachability(topologicalOrder(graph), graph.successors);
    const ancestors = graph.units.map(() => [] as number[]);
    graph.members.forEach((members, unit) => {
        const visit = (member: number): void => {
            ancestors[member].push(unit);
            for (const inner of graph.members[member]) visit(inner);
        };
        for (const member of members) visit(member);
    });
    /** Whether `systems` names `unit` or a composite holding it. */
    const names = (systems: readonly object[] | undefined, unit: number): boolean => {
        const named = graph.resolve(systems);
        return named.includes(unit) || ancestors[unit].some(holder => named.includes(holder));
    };
    const constrains = (unit: number, list: "after" | "before", other: number): boolean =>
        [unit, ...ancestors[unit]].some(holder => holder !== 0 && names(graph.units[holder].declaration[list], other));
    const placements = new Map<Leaf, readonly Placement[]>();
    leaves.forEach(({ leaf, unit }, b) => {
        const before = leaves.flatMap((other, a) => a !== b && reaches(reach, end(other.unit), start(unit)) ? [a] : []);
        const direct = before.filter(a => !before.some(other => other !== a && reaches(reach, end(leaves[a].unit), start(leaves[other].unit))));
        placements.set(leaf, direct.map(a => {
            const other = leaves[a];
            const because = constrains(unit, "after", other.unit) ? "after"
                : constrains(other.unit, "before", unit) ? "before"
                : [...accesses[a].reduces].some(key => accesses[b].reads.has(key)) ? "reduction" : "during";
            return { leaf: other.leaf, because, conflicts: conflictsOf(accesses[a], accesses[b]) };
        }));
    });
    return placements;
};

const schedules = new WeakMap<Definition, Schedule>();

/** A system's schedule, created once per system. Throws on a cycle, or on two conflicting leaves with no ordering path between them. */
export const scheduleOf = (system: Definition): Schedule => {
    let schedule = schedules.get(system);
    if (schedule === undefined) schedules.set(system, schedule = createSchedule(system));
    return schedule;
};

/**
 * Orders a system's leaves into tiers. Throws on a cycle, on two conflicting leaves with no ordering path between them,
 * or on inputs that don't merge.
 */
const createSchedule = (system: Definition): Schedule => {
    const { graph, leaves, accesses, reductions } = orderedOf(system);
    const observer = graph.units.filter(isObserver);
    checkInputs(leaves.map(({ leaf }) => leaf));
    const order = topologicalOrder(graph);
    const reach = reachability(order, graph.successors);
    for (let a = 0; a < leaves.length; a++) {
        for (let b = a + 1; b < leaves.length; b++) {
            const key = conflictOf(accesses[a], accesses[b]);
            if (key !== undefined && !ordered(reach, leaves[a].unit, leaves[b].unit)) {
                const whole = [leaves[a].leaf, leaves[b].leaf].filter(leaf => leaf.declaration.components?.whole === true)
                    .map(leaf => ` "${leaf.name}" takes its row whole (components.whole), so it writes every member.`).join("");
                throw new Error(`Systems "${leaves[a].leaf.name}" and "${leaves[b].leaf.name}" both access "${labelOf(key)}" and one writes it; order them with before or after.${whole}`);
            }
        }
    }
    const depth = depthsOf(graph, order);
    const byDepth: Leaf[][] = [];
    for (const { leaf, unit } of leaves) (byDepth[depth[start(unit)]] ??= []).push(leaf);
    const tiers = byDepth.filter(tier => tier !== undefined);
    // A sync point comes between tiers, so a schedule of one tier has none.
    if (tiers.length < 2) return { tiers, reductions, observer, syncs: tiers.map(() => null) };
    const tierOf = new Map<Leaf, number>();
    tiers.forEach((tier, t) => { for (const leaf of tier) tierOf.set(leaf, t); });
    const edges: { readonly lo: number; readonly hi: number; readonly reason: SyncReason }[] = [];
    leaves.forEach((from, a) => {
        const changed = structuralOf(from.leaf);
        if (changed === null) return;
        leaves.forEach((to, b) => {
            if (a === b || !reaches(reach, end(from.unit), start(to.unit))) return;
            const keys = affected(changed, touchesOf(to.leaf));
            if (keys !== null) edges.push({ lo: tierOf.get(from.leaf) ?? 0, hi: (tierOf.get(to.leaf) ?? 0) - 1, reason: { from: from.leaf, to: to.leaf, keys } });
        });
    });
    return { tiers, reductions, observer, syncs: syncsOf(tiers.length, edges) };
};

/**
 * Why a sync point follows a tier: a system in it or before it whose commands may change, structurally, what a system
 * after the sync point that follows it reads, matches, looks up or indexes. `keys` are the components its commands name
 * that the later one uses, none where it despawns, or where its commands or a cascade could change anything.
 */
export type SyncReason = { readonly from: Leaf; readonly to: Leaf; readonly keys: readonly Key[] };

/** The components a leaf's commands may add or remove, by spawn, add or remove; `"any"` once it despawns or isn't followed. */
const structuralOf = (leaf: Leaf): ReadonlySet<Key> | "any" | null => {
    const { commands } = leaf;
    if (commands === undefined) return null;
    if (commands === null || commands.despawn === true) return "any";
    const keys = new Set([...commands.spawn ?? [], ...commands.add ?? [], ...commands.remove ?? []].map(firstKeyOf));
    // A reference written may despawn its holder, or remove itself, at the sync point.
    for (const key of keys) if (declarationOf(key)?.reference !== undefined) return "any";
    return keys.size === 0 ? null : keys;
};

/**
 * The components a leaf's rows, lookups, indexes and order name, which commands could change its view of; `any` when
 * one of them matches every entity, `cascaded` when it names a component a rule derives or `within` removes.
 */
const touchesOf = (leaf: Leaf): { readonly keys: ReadonlySet<Key>; readonly any: boolean; readonly cascaded: boolean } => {
    const { components, lookup, up, order } = leaf.declaration;
    const keys = new Set<Key>();
    let any = false;
    const add = (list: readonly Key[] | undefined): void => { for (const key of list ?? []) keys.add(firstKeyOf(key)); };
    /** Names what a query requires; one requiring nothing matches every entity. */
    const requires = (required: readonly (readonly Key[] | undefined)[], others: readonly (readonly Key[] | undefined)[]): void => {
        if (required.every(list => list === undefined || list.length === 0)) any = true;
        for (const list of [...required, ...others]) add(list);
    };
    const indexed = (index: unknown): void => {
        const declaration = indexDefinitionOf(index)?.declaration;
        if (declaration !== undefined) requires([declaration.key, declaration.components?.has], [declaration.components?.not]);
    };
    if (components !== undefined) {
        requires([components.read, components.write, components.has, components.added, components.changed], [components.optional, components.not]);
        add(Object.getOwnPropertySymbols(components.where ?? {}));
    }
    for (const name in lookup) {
        const used = lookup[name];
        if ("index" in used && used.index !== undefined) {
            indexed(used.index);
            add(used.read);
        }
        else if (!("index" in used)) requires([used.read, used.has], [used.optional, used.not, Array.isArray(used.changed) ? used.changed : undefined]);
    }
    if (order !== undefined) indexed(order);
    if (up !== undefined) add([up.through, ...up.read ?? []]);
    const cascaded = [...keys].some(key => { const declared = declarationOf(key); return declared?.derived === true || declared?.within !== undefined; });
    return { keys, any, cascaded };
};

/** The keys through which `changed` may change what `touches` names; null where it can't. */
const affected = (changed: ReadonlySet<Key> | "any", touches: ReturnType<typeof touchesOf>): readonly Key[] | null => {
    if (touches.keys.size === 0 && !touches.any) return null;
    if (changed === "any") return [];
    if (touches.any || touches.cascaded) return [...changed];
    const keys = [...changed].filter(key => touches.keys.has(key));
    return keys.length === 0 ? null : keys;
};

/**
 * The fewest sync points that put one between the tiers of each edge, after a tier from `lo` to `hi`: each placed as
 * late as the first edge it must cover allows, so it covers every edge open then. An edge's reason goes to the first
 * sync point within its tiers.
 */
const syncsOf = (count: number, edges: readonly { readonly lo: number; readonly hi: number; readonly reason: SyncReason }[]): readonly (readonly SyncReason[] | null)[] => {
    const syncs: (SyncReason[] | null)[] = new Array<SyncReason[] | null>(count).fill(null);
    let last = -1;
    for (const { lo, hi } of [...edges].sort((a, b) => a.hi - b.hi)) {
        if (last >= lo) continue;
        last = hi;
        syncs[hi] = [];
    }
    for (const { lo, hi, reason } of edges) {
        for (let t = lo; t <= hi; t++) {
            const reasons = syncs[t];
            if (reasons === null) continue;
            reasons.push(reason);
            break;
        }
    }
    return syncs;
};
