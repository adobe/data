// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Leaf } from '../../interface/system/leaf.js';
import { declarationOf, labelOf } from '../../interface/registry/index.js';
import { indexOf } from './entities.js';
import { readCell } from './cells.js';
import type { RowStorage } from './rows.js';
import { resourceCell } from './resources.js';
import { createSharedValues, holdShared, internShared, textOf } from './shared.js';
import { idOf, type State } from './state.js';

// A system's `where`: which of its matched archetypes its runs go over, by their shared values. A value passes the
// archetypes holding an equal one, by number; a predicate those it returns true for, evaluated as written, here, once per
// archetype as it appears and again for every one whenever a resource it reads changed since it last was.

/** What an archetype `where` looks at: its values of shared components, by component id. */
type Valued = { readonly shared: readonly (number | undefined)[]; readonly storageById: readonly ({ readonly layout: { readonly kind: string; readonly value?: unknown } } | undefined)[] };

/** One shared component's condition: a value's number, or a predicate. */
type Condition = { readonly id: number; readonly number: number; readonly predicate: ((value: unknown, context: object) => unknown) | null };

/**
 * The archetypes a run goes over, of those matched: the first `count` of `passing`, each with its position among the
 * matches in `indices`, kept in buffers that only grow, so a run allocates nothing.
 */
export type Where<A> = {
    readonly passing: A[];
    readonly indices: number[];
    count: number;
    /** How many times a predicate's archetype was evaluated, for tests. */
    evaluations: number;
    /** Evaluates what it must of `matches`, and lists those that pass. */
    readonly refresh: (matches: readonly A[]) => void;
    /** How many of the matches, from the first, it evaluated: those after are evaluated by the next refresh. */
    evaluated: number;
    /**
     * As matches move, removed or reused for other values (`reclaim.ts`): match `from`'s result now `to`'s; matches `a`
     * and `b` swapped; and the last evaluated left to the next refresh to evaluate.
     */
    readonly move: (from: number, to: number) => void;
    readonly swapped: (a: number, b: number) => void;
    readonly forgetLast: () => void;
};

/** What tests read of a `where`. */
type Observed = { readonly passing: readonly unknown[]; readonly count: number; readonly evaluations: number; readonly evaluated: number };

/** For tests: by system, its `where` in the last world that registered it. */
const wheres = new WeakMap<object, Observed>();

/** For tests: a system's `where` in the last world that registered it, or undefined without one. */
export const whereOf = (system: object): Observed | undefined => wheres.get(system);

/**
 * The core of a `where` over matches of type `M`: `passes` evaluates one, counting what a predicate evaluated, and
 * `readsChanged(since)` tells whether a resource a predicate reads changed after tick `since`; `now` is the tick an
 * evaluation is as of. `predicated` without predicates, so only new matches are ever evaluated.
 */
const whereOver = <M>(predicated: boolean, passes: (match: M) => boolean, readsChanged: (since: number) => boolean, now: () => number, bind: () => void): Where<M> => {
    /** The tick it last evaluated every match at: a resource changed after it evaluates them again. */
    let evaluatedAt = -1;
    /** By match, whether it passes. */
    const results: boolean[] = [];
    /** Whether matches moved since it last listed those that pass. */
    let moved = false;
    const result: Where<M> = {
        passing: [],
        indices: [],
        count: 0,
        evaluations: 0,
        evaluated: 0,
        move: (from, to) => {
            results[to] = results[from];
            moved = true;
        },
        swapped: (a, b) => {
            const kept = results[a];
            results[a] = results[b];
            results[b] = kept;
            moved = true;
        },
        forgetLast: () => {
            result.evaluated--;
            moved = true;
        },
        refresh: matches => {
            const { evaluated } = result;
            const again = predicated && evaluated > 0 && readsChanged(evaluatedAt);
            if (!again && evaluated === matches.length && !moved) return;
            if (predicated) bind();
            let changed = moved;
            moved = false;
            for (let m = again ? 0 : evaluated; m < matches.length; m++) {
                const passed = passes(matches[m]);
                if (m >= evaluated || results[m] !== passed) changed = true;
                results[m] = passed;
            }
            result.evaluated = matches.length;
            evaluatedAt = now();
            if (!changed) return;
            let count = 0;
            for (let m = 0; m < matches.length; m++) {
                if (!results[m]) continue;
                result.passing[count] = matches[m];
                result.indices[count] = m;
                count++;
            }
            result.count = count;
        },
    };
    return result;
};

/** A predicate as the world calls it, with what its declaration gave. */
const predicateOf = (given: unknown): ((value: unknown, context: object) => unknown) | null =>
    typeof given === "function" ? (value, context) => Reflect.apply(given, undefined, [value, context]) : null;

/**
 * A system's `where` in a world: its values interned there, by number, its predicates' context reading `reads`,
 * evaluated again once one of them changed since they last were.
 */
export const createWhere = <A extends Valued>(state: State, where: { readonly [key: symbol]: unknown }, reads: readonly symbol[], leaf: Leaf): Where<A> => {
    const conditions: Condition[] = Object.getOwnPropertySymbols(where).map(key => {
        const id = idOf(state, key);
        const given: unknown = Reflect.get(where, key);
        const predicate = predicateOf(given);
        if (predicate !== null) return { id, number: -1, predicate };
        const values = state.shared[id];
        if (values === undefined) throw new Error(`System "${leaf.name}": where names "${labelOf(key)}", which isn't a shared component.`);
        const number = internShared(values, given);
        // Pinned, so its number stays while no archetype holds it: one that comes to hold it again matches.
        if (number >= 0) holdShared(values, number);
        return { id, number, predicate: null };
    });
    const readIds = reads.map(key => idOf(state, key));
    // Its predicates' context: each resource read once per evaluation, since a struct's read copies it out.
    const cached: unknown[] = reads.map(() => undefined);
    const values: object = Object.create({});
    reads.forEach((key, k) => Object.defineProperty(values, key, { get: () => cached[k], enumerable: true }));
    const context = { value: { resources: values }, bind: (): void => {
        for (let k = 0; k < reads.length; k++) {
            const { storage, row } = resourceCell(state, reads[k]);
            cached[k] = readCell(storage, row);
        }
    } };
    const passes = (archetype: A): boolean => {
        for (let c = 0; c < conditions.length; c++) {
            const { id, number, predicate } = conditions[c];
            if (predicate === null) {
                if (archetype.shared[id] !== number) return false;
                continue;
            }
            const layout = archetype.storageById[id]?.layout;
            if (layout === undefined || layout.kind !== "constant") return false;
            found.evaluations++;
            if (predicate(layout.value, context.value) !== true) return false;
        }
        return true;
    };
    const readsChanged = (since: number): boolean => {
        if (readIds.length === 0 || state.resourceEntity < 0) return false;
        const index = indexOf(state.resourceEntity);
        const archetype = state.archetypes[state.entities.archetype[index]];
        const row = state.entities.row[index];
        for (let k = 0; k < readIds.length; k++) {
            const storage = archetype?.storageById[readIds[k]];
            if (storage !== undefined && storage.changed[row] > since) return true;
        }
        return false;
    };
    // Evaluated as of before its run's own tick, so what its own body writes after counts as changed.
    const found = whereOver(conditions.some(condition => condition.predicate !== null), passes, readsChanged, () => state.tick - 1, context.bind);
    wheres.set(leaf, found);
    return found;
};

/** What a joined thread's `where` reads of its world: archetypes' views by id, its numbers for keys and its resource row. */
type ThreadWhereHost<A> = {
    readonly archetypeAt: (id: number) => A | undefined;
    readonly numberOf: (key: symbol) => number;
    readonly resourceRow: () => { readonly archetype: { readonly storageById: readonly (RowStorage | undefined)[] }; readonly row: number } | null;
    readonly tick: () => number;
};

/**
 * A system's `where` on a joined thread, over its matches by archetype id: a value compared by its canonical text with
 * each archetype's, which the layout directory gives it, and its predicates run here, reading this thread's view of the
 * resources.
 */
export const createThreadWhere = <A extends { readonly storageById: readonly (RowStorage | undefined)[] }>(host: ThreadWhereHost<A>, where: { readonly [key: symbol]: unknown }, reads: readonly symbol[]): Where<number> => {
    const conditions = Object.getOwnPropertySymbols(where).map(key => {
        const given: unknown = Reflect.get(where, key);
        const predicate = predicateOf(given);
        const values = createSharedValues(declarationOf(key)?.type);
        const number = predicate === null ? internShared(values, given) : -1;
        return { number: host.numberOf(key), text: number < 0 ? null : values.texts[number] ?? null, predicate };
    });
    const readNumbers = reads.map(host.numberOf);
    const values: object = Object.create({});
    reads.forEach((key, k) => {
        Object.defineProperty(values, key, {
            get: () => {
                const found = host.resourceRow();
                const storage = found?.archetype.storageById[readNumbers[k]];
                return storage === undefined || found === null ? undefined : readCell(storage, found.row);
            },
            enumerable: true,
        });
    });
    const context: object = { resources: values };
    const passes = (id: number): boolean => {
        const archetype = host.archetypeAt(id);
        if (archetype === undefined) return false;
        for (const { number, text, predicate } of conditions) {
            const layout = archetype.storageById[number]?.layout;
            if (layout === undefined || layout.kind !== "constant") return false;
            if (predicate === null) {
                if (text === null || textOf(layout.value) !== text) return false;
                continue;
            }
            found.evaluations++;
            if (predicate(layout.value, context) !== true) return false;
        }
        return true;
    };
    const readsChanged = (since: number): boolean => {
        const row = readNumbers.length === 0 ? null : host.resourceRow();
        if (row === null) return false;
        for (const number of readNumbers) {
            const storage = row.archetype.storageById[number];
            if (storage !== undefined && storage.changed[row.row] > since) return true;
        }
        return false;
    };
    const found = whereOver(conditions.some(condition => condition.predicate !== null), passes, readsChanged, host.tick, () => {});
    return found;
};
