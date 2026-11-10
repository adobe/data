// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Leaf } from '../../interface/system/leaf.js';
import type { Schedule } from '../../interface/registry/schedule.js';
import type { Archetype } from './archetype.js';
import type { KernelFusion } from './kernels.js';
import type { Program } from './kernel.js';
import type { Runner } from './runner.js';
import { maximumScalars, type KernelSetup, type Source } from './protocol.js';
import type { State } from './state.js';
import { withoutIntrinsics } from './intrinsics.js';
import { generateWasm, instantiateWasm, scalarValue, type WasmColumn, type WasmKernel, type WasmRun, type WasmScalar } from './wasm.js';

type Expression = Program.Expression;
type Statement = Program.Statement;

/**
 * Kernels a schedule runs one after another, over the same rows, fused into one pass: per row, each member's body in
 * turn, as a row's own values are all any of them reads of it. A group runs where its last member runs; its earlier
 * members' tiers between hold nothing that conflicts with them, and no sync point.
 */
export type FusedGroup = {
    readonly members: readonly Runner[];
    /** Its members' kernels, by which a refusal is remembered. */
    readonly key: string;
    /** Workers' index for the fused kernel. */
    readonly index: number;
    /** Each member's run as it started: its resources' values and tick, until the last member runs the group. */
    readonly held: (Held | null)[];
    /** The fused kernel once it's compiled, null while it isn't, and why it won't be when it can't. */
    fused: Fused | null;
    compiling: Promise<void> | null;
    refused: boolean;
    /** The members' kernels' loads the fused kernel was generated from. */
    loadedFrom: string;
    /** The loads the pool's workers have the fused kernel from, null while they have none. */
    workersFor: string | null;
    /** Whether this run runs the group, as its first member found when it started. */
    active: boolean;
};

/** A member's run, held for the group: its resources' values, its tick, and its own pass over an archetype. */
export type Held = { readonly values: readonly unknown[]; readonly tick: number; readonly runOwn: (archetype: Archetype) => void };

/** A runner's place in its group: which member it is; the last runs the group. */
export type FusionRole = { readonly group: FusedGroup; readonly member: number };

type Fused = {
    readonly wasm: WasmKernel;
    readonly module: WebAssembly.Module;
    readonly run: WasmRun;
    /** By fused column, its member and that member's column. */
    readonly columns: readonly (readonly [number, number])[];
    /** By fused resource, a member reading it and that member's resource. */
    readonly resources: readonly (readonly [number, number])[];
};

/** A schedule with its groups' members moved to each group's last tier, and each runner's role there. */
export type FusedSchedule = { readonly schedule: Schedule; readonly roles: readonly (readonly (FusionRole | null)[])[] };

/**
 * Whether a system's kernel can run fused: a WASM program over its own rows alone, every row, taking no input. Lookups,
 * `up`, order, targets, change filters, conditions, `where`, reductions, shared and optional components, input and a body
 * that ends a row early run alone.
 */
const fusible = (runner: Runner, leaf: Leaf): boolean => {
    const { kernel } = runner;
    if (kernel === null || kernel.description.program === null || runner.placement !== "cpu" || runner.remote !== null || runner.targets.length > 0) return false;
    if (leaf.input !== undefined || (kernel.description.writes?.length ?? 0) > 0) return false;
    const { components, resources, lookup, up, order, target } = leaf.declaration;
    if (lookup !== undefined && Object.keys(lookup).length > 0) return false;
    if (up !== undefined || order !== undefined || target !== undefined || components?.where !== undefined) return false;
    if ((components?.added?.length ?? 0) + (components?.changed?.length ?? 0) + (components?.optional?.length ?? 0) > 0) return false;
    if ((resources?.changed?.length ?? 0) + (resources?.is?.length ?? 0) + (resources?.not?.length ?? 0) > 0) return false;
    if ((kernel.description.shared?.length ?? 0) > 0 || kernel.description.columns.some(column => column.kind === "present")) return false;
    return rowsOnly(kernel.description.program.body);
};

/** Whether statements only compute their row: no early end, lookups, lists or input. */
const rowsOnly = (statements: readonly Statement[]): boolean => statements.every(statement => {
    switch (statement.kind) {
        case "next": case "find": case "probe": case "listRow": return false;
        case "set": case "store": return pure(statement.value);
        case "resourceStore": return false;
        case "if": return pure(statement.test) && rowsOnly(statement.consequent) && rowsOnly(statement.alternate);
        case "block": case "loop": case "intrinsic": return rowsOnly(statement.body);
        case "branchIf": return pure(statement.test);
        default: return true;
    }
});
const pure = (expression: Expression): boolean => {
    switch (expression.kind) {
        case "args": case "shared": case "found": case "lookupLeaf": case "lookupHas": case "lookupTruthy": case "upFound": case "upLeaf": case "listLength": case "listChanged": case "rowLeaf": case "rowEntity": case "resourceElement": return false;
        case "unary": return pure(expression.operand);
        case "binary": case "logical": return pure(expression.left) && pure(expression.right);
        case "conditional": return pure(expression.test) && pure(expression.consequent) && pure(expression.alternate);
        case "math": return expression.arguments.every(pure);
        case "lane": return pure(expression.value);
        default: return true;
    }
};

/** The component and resource ids a runner reads or writes, and those it writes. */
const usesOf = (state: State, runner: Runner, leaf: Leaf): { readonly all: ReadonlySet<number>; readonly writes: ReadonlySet<number> } => {
    const resources = leaf.declaration.resources;
    const resourceIds = (keys: readonly symbol[] | undefined): number[] => (keys ?? []).map(key => state.ids.get(key) ?? -1);
    const writes = new Set([...runner.writes, ...runner.resourceWrites, ...resourceIds(resources?.write)]);
    return { all: new Set([...runner.touches, ...runner.looks, ...resourceIds(resources?.read), ...writes]), writes };
};

/** The components a kernel's body reads, as its columns' sources name them. */
const readsOf = (runner: Runner): ReadonlySet<number> => {
    const reads = new Set<number>();
    const kernel = runner.kernel;
    if (kernel === null || kernel.description.program === null) return reads;
    const { sources } = kernel.fusion();
    const expression = (node: Expression): void => {
        switch (node.kind) {
            case "column": {
                const source = sources[node.column];
                if (source !== undefined && source.kind === "field") reads.add(source.id);
                return;
            }
            case "unary": return expression(node.operand);
            case "binary": case "logical": expression(node.left); return expression(node.right);
            case "conditional": expression(node.test); expression(node.consequent); return expression(node.alternate);
            case "math": return node.arguments.forEach(expression);
            case "lane": return expression(node.value);
            default: return;
        }
    };
    const statement = (node: Statement): void => {
        switch (node.kind) {
            case "set": case "store": return expression(node.value);
            case "if": expression(node.test); node.consequent.forEach(statement); return node.alternate.forEach(statement);
            case "block": case "loop": case "intrinsic": return node.body.forEach(statement);
            case "branchIf": return expression(node.test);
            default: return;
        }
    };
    kernel.description.program.body.forEach(statement);
    return reads;
};

const conflict = (a: ReturnType<typeof usesOf>, b: ReturnType<typeof usesOf>): boolean =>
    [...a.writes].some(id => b.all.has(id)) || [...b.writes].some(id => a.all.has(id));

/**
 * Groups a schedule's fusible kernels: each joins the group of an earlier fusible kernel touching a component it reads,
 * where no sync point comes between them and nothing in the tiers between conflicts with the group's earlier members,
 * which then run in its tier. Its reads then come from what the group already loaded. A kernel reading nothing the
 * others touch runs alone: one sharing only components it writes gains little or loses, and one sharing nothing loses,
 * streaming more components at once.
 */
export const fuseSchedule = (state: State, schedule: Schedule, runnerOf: (leaf: Leaf) => Runner): FusedSchedule & { readonly groups: readonly FusedGroup[] } => {
    type Placed = { readonly leaf: Leaf; readonly runner: Runner; readonly tier: number; readonly uses: ReturnType<typeof usesOf>; readonly reads: ReadonlySet<number>; group: Placed[] | null };
    const placed: Placed[][] = schedule.tiers.map((tier, t) => tier.map(leaf => {
        const runner = runnerOf(leaf);
        return { leaf, runner, tier: t, uses: usesOf(state, runner, leaf), reads: readsOf(runner), group: null };
    }));
    const groups: Placed[][] = [];
    for (let t = 1; t < placed.length; t++) {
        for (const later of placed[t]) {
            if (!fusible(later.runner, later.leaf)) continue;
            const readsFrom = (earlier: Placed): boolean => earlier.runner.touches.some(id => later.reads.has(id));
            const shares = (group: Placed[]): boolean => group.some(readsFrom);
            const candidate = groups.find(group => {
                const last = group[group.length - 1];
                if (last === undefined || last.tier >= t || !shares(group)) return false;
                for (let s = group[0]?.tier ?? t; s < t; s++) if (schedule.syncs[s] !== null) return false;
                // What runs in the tiers it moves over, and beside it, mustn't conflict with what moves.
                for (let s = (group[0]?.tier ?? t) + 1; s <= t; s++) {
                    for (const other of placed[s]) {
                        if (other === later || group.includes(other)) continue;
                        if (group.some(member => member.tier < s && conflict(member.uses, other.uses))) return false;
                    }
                }
                return true;
            });
            if (candidate !== undefined) {
                candidate.push(later);
                later.group = candidate;
                continue;
            }
            const earlier = placed.slice(0, t).flat().find(other => other.group === null && fusible(other.runner, other.leaf)
                && readsFrom(other)
                && placed.slice(other.tier + 1, t + 1).every(tier => tier.every(next => next === later || !conflict(other.uses, next.uses)))
                && schedule.syncs.slice(other.tier, t).every(sync => sync === null));
            if (earlier === undefined) continue;
            const group = [earlier, later];
            earlier.group = later.group = group;
            groups.push(group);
        }
    }
    const keyOf = (group: Placed[]): string => `fused ${group.map(member => member.runner.kernel?.description.url ?? "").join(" ")}`;
    // A refused group's members run alone, where they were.
    for (const group of groups) if (state.refusedFusions.has(keyOf(group))) for (const member of group) member.group = null;
    const kept = groups.filter(group => !state.refusedFusions.has(keyOf(group)));
    if (kept.length === 0) return { schedule, roles: schedule.tiers.map(tier => tier.map(() => null)), groups: [] };
    const fusedGroups = new Map(kept.map(group => {
        const members = group.map(member => member.runner);
        const key = keyOf(group);
        let index = state.kernelIndexes.get(key);
        if (index === undefined) state.kernelIndexes.set(key, index = state.kernelIndexes.size);
        return [group, { members, key, index, held: group.map(() => null), fused: null, compiling: null, refused: false, loadedFrom: "", workersFor: null, active: false } satisfies FusedGroup];
    }));
    const tiers: Leaf[][] = schedule.tiers.map(() => []);
    const roles: (FusionRole | null)[][] = schedule.tiers.map(() => []);
    for (const tier of placed) {
        for (const entry of tier) {
            const group = entry.group;
            if (group === null) {
                tiers[entry.tier]?.push(entry.leaf);
                roles[entry.tier]?.push(null);
                continue;
            }
            // A group's members join its last tier there, in order.
            if (entry !== group[group.length - 1]) continue;
            const fused = fusedGroups.get(group);
            group.forEach((member, k) => {
                tiers[entry.tier]?.push(member.leaf);
                roles[entry.tier]?.push(fused === undefined ? null : { group: fused, member: k });
            });
        }
    }
    // Tiers a group left empty go, with their sync points, which no group crossed.
    const filled = tiers.flatMap((tier, t) => tier.length === 0 ? [] : [t]);
    return {
        schedule: { tiers: filled.map(t => tiers[t] ?? []), reductions: schedule.reductions, observer: schedule.observer, syncs: filled.map(t => schedule.syncs[t] ?? null) },
        roles: filled.map(t => roles[t] ?? []),
        groups: [...fusedGroups.values()],
    };
};

/** A member's column's identity: its source, the same in every member over its component. */
const sourceKey = (source: Source | undefined): string => source === undefined ? "?" : source.kind === "entity" ? "entity" : `${source.kind} ${source.id} ${source.leaf}`;

/**
 * The members' programs as one: each member's statements in turn, its locals after the earlier members', its columns
 * and resources the fused kernel's, read and written by every member that names them. Of stamps of one tick column at
 * the top of two bodies, the later stands for both.
 */
const fuseMembers = (parts: readonly KernelFusion[], programs: readonly Program[], resourceKeys: readonly (readonly symbol[])[]) => {
    const columns: WasmColumn[] = [];
    const columnSources: (readonly [number, number])[] = [];
    const columnIndex = new Map<string, number>();
    const resources: (readonly [number, number])[] = [];
    const resourceIndex = new Map<symbol, number>();
    const body: Statement[] = [];
    let locals = 0;
    parts.forEach((part, m) => {
        const program = withoutIntrinsics(programs[m] ?? { locals: 0, body: [] });
        const columnMap = part.columns.map((column, k) => {
            const key = sourceKey(part.sources[k]);
            let index = columnIndex.get(key);
            if (index === undefined) {
                index = columns.length;
                columnIndex.set(key, index);
                columns.push(column);
                columnSources.push([m, k]);
            }
            return index;
        });
        const resourceMap = (resourceKeys[m] ?? []).map((key, k) => {
            let index = resourceIndex.get(key);
            if (index === undefined) {
                index = resources.length;
                resourceIndex.set(key, index);
                resources.push([m, k]);
            }
            return index;
        });
        const offset = locals;
        const expression = (node: Expression): Expression => {
            switch (node.kind) {
                case "column": return { ...node, column: columnMap[node.column] ?? node.column };
                case "resource": return { ...node, index: resourceMap[node.index] ?? node.index };
                case "local": return { ...node, local: node.local + offset };
                case "unary": return { ...node, operand: expression(node.operand) };
                case "binary": case "logical": return { ...node, left: expression(node.left), right: expression(node.right) };
                case "conditional": return { ...node, test: expression(node.test), consequent: expression(node.consequent), alternate: expression(node.alternate) };
                case "math": return { ...node, arguments: node.arguments.map(expression) };
                default: return node;
            }
        };
        const statement = (node: Statement): Statement => {
            switch (node.kind) {
                case "set": return { ...node, local: node.local + offset, value: expression(node.value) };
                case "store": return { ...node, column: columnMap[node.column] ?? node.column, value: expression(node.value) };
                case "stamp": return { ...node, column: columnMap[node.column] ?? node.column, chunks: columnMap[node.chunks] ?? node.chunks, blocks: columnMap[node.blocks] ?? node.blocks };
                case "if": return { ...node, test: expression(node.test), consequent: node.consequent.map(statement), alternate: node.alternate.map(statement) };
                case "block": case "loop": return { ...node, body: node.body.map(statement) };
                case "branchIf": return { ...node, test: expression(node.test) };
                default: return node;
            }
        };
        body.push(...program.body.map(statement));
        locals += program.locals;
    });
    const stamped = new Set<number>();
    const deduplicated: Statement[] = [];
    for (let k = body.length - 1; k >= 0; k--) {
        const statement = body[k];
        if (statement === undefined) continue;
        if (statement.kind === "stamp") {
            if (stamped.has(statement.column)) continue;
            stamped.add(statement.column);
        }
        deduplicated.push(statement);
    }
    deduplicated.reverse();
    const scalarType = (scalar: WasmScalar) => {
        if (scalar.source !== "resource") return null;
        const [m, k] = resources[scalar.index] ?? [-1, -1];
        return parts[m]?.scalarType({ ...scalar, index: k }) ?? null;
    };
    const arrays = (resource: number) => {
        const [m, k] = resources[resource] ?? [-1, -1];
        return parts[m]?.arrays(k) ?? null;
    };
    return { program: { locals, body: deduplicated }, columns, columnSources, resources, scalarType, arrays };
};

/**
 * Compiles a group's fused kernel from its members' kernels as loaded: kept only where it runs several rows at a time
 * when any member does alone, since a member's vectors outrun one row at a time even over shared components.
 */
const compileGroup = async (state: State, group: FusedGroup): Promise<void> => {
    const kernels = group.members.map(member => member.kernel);
    const parts = kernels.map(kernel => kernel?.fusion());
    if (parts.some(part => part === undefined || part.loaded === null) || kernels.some(kernel => kernel?.wasm === null || kernel?.description.program === null)) return;
    const fusion = parts.flatMap(part => part === undefined ? [] : [part]);
    const merged = fuseMembers(fusion, kernels.flatMap(kernel => kernel?.description.program ?? []), kernels.map(kernel => (kernel?.description.resources ?? []).flatMap(key => typeof key === "symbol" ? [key] : [])));
    const wasm = generateWasm(merged.program, merged.columns, merged.scalarType, state.simd, 0, [], [], [], [], [], kernels.every(kernel => kernel?.description.storagePrecision === true), merged.arrays);
    group.loadedFrom = fusion.map(part => part.loaded).join("|");
    if (wasm === null || (!wasm.vectorized && kernels.some(kernel => kernel?.wasm?.vectorized === true))) {
        group.refused = true;
        state.refusedFusions.add(group.key);
        return;
    }
    const module = await WebAssembly.compile(wasm.bytes);
    const run = await instantiateWasm(module, state.memory.memory, wasm.imports);
    group.fused = { wasm, module, run, columns: merged.columnSources, resources: merged.resources };
};

/** Whether a group's fused kernel runs this run, compiling it once its members' kernels are loaded. */
export const groupReady = (state: State, group: FusedGroup): boolean => {
    const loaded = group.members.map(member => member.kernel?.fusion().loaded ?? null).join("|");
    if (group.fused !== null && group.loadedFrom === loaded) return true;
    if (group.loadedFrom !== loaded) {
        group.fused = null;
        group.refused = false;
    }
    if (!group.refused && group.compiling === null) {
        group.compiling = compileGroup(state, group).catch(() => {
            group.refused = true;
            state.refusedFusions.add(group.key);
        }).finally(() => { group.compiling = null; });
    }
    return false;
};

/** Compiles a group's fused kernel, if it isn't, as its members' kernels are loaded, before the runs that use it. */
export const loadGroup = async (state: State, group: FusedGroup): Promise<void> => {
    if (groupReady(state, group)) return;
    await group.compiling;
};

/** The world's fused groups whose schedules and members live, forgetting the rest. */
export const liveGroups = (state: State): FusedGroup[] => {
    const groups: FusedGroup[] = [];
    for (const reference of state.fusedGroups) {
        const group = reference.deref();
        if (group === undefined || group.members.some(member => member.holdings.removed)) state.fusedGroups.delete(reference);
        else groups.push(group);
    }
    return groups;
};

/** Whether the pool's workers have the group's fused kernel as it is on this thread. */
export const groupOnWorkers = (group: FusedGroup): boolean => group.fused !== null && group.workersFor === group.loadedFrom;

/**
 * Whether a member's run runs the group: decided by its first member, as each run starts, for every member; with
 * workers, only where they have the fused kernel, since members left to run alone would run at once.
 */
export const joinGroup = (state: State, role: FusionRole, workers: boolean): boolean => {
    const { group } = role;
    if (role.member === 0) group.active = groupReady(state, group) && (!workers || groupOnWorkers(group)) && !group.members.some(member => member.holdings.removed);
    return group.active;
};

/**
 * The fused kernel as workers load it: each fused column as the member it came from binds it, and the last member's
 * module, whose JS kernel workers never run, as the fused kernel runs only as WASM; null for one no task can carry.
 */
export const groupSetup = (group: FusedGroup, setupOf: (runner: Runner) => KernelSetup | null): KernelSetup | null => {
    const { fused } = group;
    // A task carries at most `maximumScalars`.
    if (fused === null || fused.wasm.scalars.length > maximumScalars) return null;
    const setups = group.members.map(setupOf);
    const last = setups[setups.length - 1];
    if (last === undefined || last === null || setups.some(setup => setup === null)) return null;
    const at = <T>(pick: (setup: KernelSetup) => readonly T[]): T[] => fused.columns.flatMap(([m, k]) => {
        const setup = setups[m];
        const value = setup === undefined || setup === null ? undefined : pick(setup)[k];
        return value === undefined ? [] : [value];
    });
    return {
        ...last,
        index: group.index,
        sources: at(setup => setup.sources),
        booleans: at(setup => setup.booleans),
        strides: at(setup => setup.strides),
        offsets: at(setup => setup.offsets),
        muted: at(setup => setup.muted),
        lookups: [],
        indexes: [],
        optional: [],
        spawns: [],
        added: [],
        changed: [],
        reduces: false,
        wasm: { module: fused.module, scalars: fused.wasm.scalars, imports: fused.wasm.imports },
    };
};

/** The fused kernel's scalars for a run: each resource's value from a member reading it. */
export const groupScalars = (group: FusedGroup, values: readonly unknown[]): number[] => {
    const { fused, held, members } = group;
    if (fused === null) return [];
    const last = members.length - 1;
    const resourceValues = fused.resources.map(([m, k]) => (m === last ? values : held[m]?.values ?? [])[k]);
    return fused.wasm.scalars.map(scalar => scalarValue(scalar, resourceValues, undefined));
};

/** Whether each member before the last held its run for the group, which the fused kernel then runs. */
export const groupHeld = (group: FusedGroup): boolean => group.fused !== null && group.held.every((entry, m) => m === group.members.length - 1 || entry !== null);

/** Whether every member matches an archetype, which the fused kernel then runs over. */
export const groupCovers = (group: FusedGroup, archetype: Archetype): boolean => group.members.every(member => member.isMatched(archetype));

/**
 * The group's pass over an archetype, from its last member's run: the fused kernel where every member held its run,
 * else each member that did, its own, and the last's own after.
 */
export const runGroup = (group: FusedGroup, archetype: Archetype, values: readonly unknown[], tick: number, runOwn: (archetype: Archetype) => void): void => {
    const { fused, held, members } = group;
    if (fused === null || !groupHeld(group)) {
        for (let m = 0; m < members.length - 1; m++) held[m]?.runOwn(archetype);
        runOwn(archetype);
        return;
    }
    const call: number[] = [0, archetype.count, tick, -1];
    for (const [m, k] of fused.columns) call.push(members[m]?.kernel?.columnsOf(archetype)[k]?.byteOffset ?? 0);
    call.push(...groupScalars(group, values));
    Reflect.apply(fused.run, undefined, call);
};
