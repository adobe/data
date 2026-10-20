import { Index, System, type Component, type Entity, type World } from '../index.js';
import { compare, predicateOf } from './compare.js';
import type { Observe } from './observe.js';
import { createAll, createCount, createHeap, createSorted, type Gather, type Page, type Term, type Values } from './plans.js';
import {
    createEntry, give, keysId, labelOf, deliverAlso, none, numberOf, scheduleDelivery, scheduleRead, stateOf, subscribe, sweepSubscribers, throwFailed,
    type Entry, type Read, type Shape, type WorldState,
} from './world-state.js';

/** A query as `select` and `count` take it, without its types. */
type AnyQuery = {
    readonly required?: readonly Component.Key[];
    readonly not?: readonly Component.Key[];
    readonly where?: object;
    readonly order?: object;
    readonly page?: Page;
};

/** A query's observers with one `where` and page: its value, its `where` tests in its shape's order, and what gathers it. */
type QueryEntry = Entry<unknown> & {
    readonly id: string;
    readonly tests: readonly ((value: unknown) => boolean)[];
    readonly page: Page | null;
    readonly gather: Gather;
};

/**
 * A scan for cold first values, of the entries waiting for one flush's: started by its first row, in its run, and
 * finished in the delivering run after it, which runs before anything else could change the world.
 */
type Scan = { readonly batch: number; started: boolean; readonly entries: QueryEntry[] };

/**
 * The observers of one shape of query, its components, `where` keys and `order`, each `where` and page an entry. Cold
 * first values come from a scan of its rows while no subscriber outlived its first value; then `tracker`, added, keeps
 * every entry's value, through an index: a sorted one on `order` when every term goes one direction, else one without
 * a key, of what matches.
 */
type QueryShape = Shape & {
    readonly entries: QueryEntry[];
    readonly byId: Map<string, QueryEntry>;
    readonly read: Read;
    readonly scans: Scan[];
    tracking: boolean;
    waiting: boolean;
    swept: boolean;
};

const shapes = new WeakMap<WorldState, Map<string, QueryShape>>();

/** An index's list of rows, as a lookup through it gives them. */
type Rows = { readonly length: number; readonly changed: boolean; at(index: number): { readonly entity: Entity } & Values };

/** Indexes the trackers look up through, by declaration: one each in the program. */
const keyless = new Map<string, Index<{ readonly key: readonly []; readonly components: { readonly has: readonly Component.Key[]; readonly not: readonly Component.Key[] } }>>();
const sortedIndexes = new Map<string, Index<{ readonly key: readonly Component.Key[]; readonly sorted: true; readonly components: { readonly has: readonly Component.Key[]; readonly not: readonly Component.Key[] } }> | null>();

/**
 * Whether `not` excludes none of `held`, an index's key parts and `has`: what an index declaration's type checks of
 * lists it can see, which these are only at run time.
 */
const excludesNone = (not: readonly Component.Key[], held: readonly Component.Key[]): not is readonly never[] => {
    for (let i = 0; i < not.length; i++) if (held.includes(not[i])) return false;
    return true;
};

/** `not`, which `observeQuery` made exclude no required component, as an index declaration takes it. */
const excluding = (not: readonly Component.Key[], held: readonly Component.Key[]): readonly never[] => {
    if (!excludesNone(not, held)) throw new Error("An index can't exclude what it holds by.");
    return not;
};

const keylessOf = (has: readonly Component.Key[], not: readonly Component.Key[]) => {
    const id = `${keysId(has)}|${keysId(not)}`;
    let index = keyless.get(id);
    if (index === undefined) keyless.set(id, index = Index.create({ name: `Observe.query(${labelOf(has)})`, key: [], components: { has: [...has], not: excluding(not, has) } }));
    return index;
};

/** A sorted index on `key`, or null where one can't be, as for a part whose values have no order. */
const sortedOf = (key: readonly Component.Key[], has: readonly Component.Key[], not: readonly Component.Key[]) => {
    const id = `${keysId(key)}|${keysId(has)}|${keysId(not)}`;
    let index = sortedIndexes.get(id);
    if (index === undefined) {
        try {
            index = Index.create({ name: `Observe.query(${labelOf(has)}) by ${labelOf(key)}`, key: [...key], sorted: true, components: { has: [...has], not: excluding(not, [...key, ...has]) } });
        }
        catch {
            index = null;
        }
        sortedIndexes.set(id, index);
    }
    return index;
};

const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0;

/** A `where` value's identity: equal values give the same text. */
const identityOf = (value: unknown): string => {
    if (typeof value === "number") return Object.is(value, -0) ? "n0" : `n${value}`;
    if (typeof value === "string") return `s${JSON.stringify(value)}`;
    if (typeof value === "boolean") return value ? "t" : "f";
    if (value === null) return "z";
    if (value === undefined) return "u";
    if (Array.isArray(value)) return `[${value.map(identityOf).join(",")}]`;
    if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${identityOf(Reflect.get(value, key))}`).join(",")}}`;
    return `?${String(value)}`;
};

const unique = (keys: readonly Component.Key[]): Component.Key[] => [...new Set(keys)];
const byNumber = (a: symbol, b: symbol): number => numberOf(a) - numberOf(b);

const createShape = (state: WorldState, byShape: Map<string, QueryShape>, id: string, counting: boolean, impossible: boolean, required: readonly Component.Key[], not: readonly Component.Key[], where: readonly Component.Key[], terms: readonly Term[]): QueryShape => {
    const reads = unique([...where, ...terms.map(term => term.key)]);
    const has = unique([...required, ...reads]);
    const name = `Observe.${counting ? "count" : "select"}(${labelOf(required)})`;
    const direction = terms.length > 0 && terms.every(term => term.ascending === terms[0].ascending) ? terms[0].ascending : null;
    const sortedKey = terms.map(term => term.key);
    const sorted = !counting && direction !== null ? sortedOf(sortedKey, has.filter(key => !sortedKey.includes(key)), not) : null;
    /** Reused for results being compared with the last. */
    const out: Entity[] = [];

    const passes = (entry: QueryEntry, values: Values): boolean => {
        if (impossible) return false;
        const { tests } = entry;
        for (let k = 0; k < tests.length; k++) if (!tests[k](values[where[k]])) return false;
        return true;
    };

    /** Writes an entry's result into `out` through a list of rows in entity order, and returns its length or count. */
    const fromKeyless = (entry: QueryEntry, rows: Rows): number => {
        const length = impossible ? 0 : rows.length;
        if (counting && entry.tests.length === 0) return length;
        if (counting || terms.length > 0) {
            entry.gather.start();
            for (let i = 0; i < length; i++) {
                const row = rows.at(i);
                if (passes(entry, row)) entry.gather.add(row.entity, row);
            }
            return entry.gather.finish(out);
        }
        const { page } = entry;
        const limit = page === null ? length : page.limit;
        let skip = page === null ? 0 : page.offset;
        let n = 0;
        if (entry.tests.length === 0) {
            for (let i = skip; i < length && n < limit; i++) out[n++] = rows.at(i).entity;
            return n;
        }
        for (let i = 0; i < length && n < limit; i++) {
            const row = rows.at(i);
            if (!passes(entry, row)) continue;
            if (skip > 0) skip--;
            else out[n++] = row.entity;
        }
        return n;
    };

    /** The key of the row at `at`, by term, reused. */
    const tie: unknown[] = terms.map(() => undefined);
    const sameKey = (values: Values): boolean => {
        for (let t = 0; t < terms.length; t++) if (compare(values[terms[t].key], tie[t]) !== 0) return false;
        return true;
    };
    /** The first position of the run of rows whose key is the key of the row at `at`, found by galloping back. */
    const runStart = (rows: Rows, at: number): number => {
        const row = rows.at(at);
        for (let t = 0; t < terms.length; t++) tie[t] = row[terms[t].key];
        let low = at;
        let step = 1;
        // Rows before `low` with the same key: found by doubling steps, then bisected.
        while (low - step >= 0 && sameKey(rows.at(low - step))) {
            low -= step;
            step *= 2;
        }
        let high = low;
        low = Math.max(-1, low - step);
        // Now `low` is before the run, or -1, and `high` in it.
        while (high - low > 1) {
            const middle = (low + high) >> 1;
            if (sameKey(rows.at(middle))) high = middle;
            else low = middle;
        }
        return high;
    };

    /** Writes an entry's result into `out` through a sorted index's rows, ties in entity order whichever the direction. */
    const fromSorted = (entry: QueryEntry, rows: Rows): number => {
        const length = impossible ? 0 : rows.length;
        const { page } = entry;
        const limit = page === null ? length : page.limit;
        let skip = page === null ? 0 : page.offset;
        let n = 0;
        const filtered = entry.tests.length > 0;
        if (direction === true) {
            if (!filtered) {
                for (let i = skip; i < length && n < limit; i++) out[n++] = rows.at(i).entity;
                return n;
            }
            for (let i = 0; i < length && n < limit; i++) {
                const row = rows.at(i);
                if (!passes(entry, row)) continue;
                if (skip > 0) skip--;
                else out[n++] = row.entity;
            }
            return n;
        }
        // Descending: runs of equal keys from the last, each in entity order.
        for (let end = length - 1; end >= 0 && n < limit;) {
            const start = runStart(rows, end);
            if (!filtered && end - start + 1 <= skip) skip -= end - start + 1;
            else for (let i = start; i <= end && n < limit; i++) {
                const row = rows.at(i);
                if (filtered && !passes(entry, row)) continue;
                if (skip > 0) skip--;
                else out[n++] = row.entity;
            }
            end = start - 1;
        }
        return n;
    };

    /** Whether the first `count` of `out` are an entry's last value. */
    const same = (entry: QueryEntry, count: number): boolean => {
        if (counting) return entry.value === count;
        const last = entry.value;
        if (!Array.isArray(last) || last.length !== count) return false;
        for (let i = 0; i < count; i++) if (last[i] !== out[i]) return false;
        return true;
    };

    /** Sets an entry's value from its result, unless it's the last; returns whether it changed. */
    const settle = (entry: QueryEntry, count: number): boolean => {
        if (entry.valid && same(entry, count)) return false;
        entry.value = counting ? count : out.slice(0, count);
        entry.valid = true;
        return true;
    };

    /** Drops entries found without subscribers in three passes, as shapes are; returns whether any is left without them. */
    const sweep = (): boolean => {
        const { entries } = shape;
        let kept = 0;
        let idle = false;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.stopped > 0) sweepSubscribers(entry);
            if (entry.live === 0) {
                if (!shape.tracking || ++entry.idle > 2) {
                    shape.byId.delete(entry.id);
                    continue;
                }
                idle = true;
            }
            entries[kept++] = entry;
        }
        entries.length = kept;
        return idle;
    };

    /** Keeps every entry's value through the index's rows, or with nothing changed, gives waiting subscribers theirs. */
    const track = (rows: Rows, from: (entry: QueryEntry, rows: Rows) => number): void => {
        if (!shape.swept) shape.swept = !sweep();
        const changed = rows.changed;
        if (!changed && !shape.waiting) return;
        const through = state.delivered;
        const { entries } = shape;
        let failed: unknown = none;
        let waiting = false;
        for (let i = 0, count = entries.length; i < count; i++) {
            const entry = entries[i];
            if (changed || (entry.waiting > 0 && !entry.valid)) failed = give(entry, through, settle(entry, from(entry, rows)), state.pass, -1, failed);
            else if (entry.waiting > 0) failed = give(entry, through, false, state.pass, -1, failed);
            if (entry.waiting > 0) waiting = true;
        }
        shape.waiting = waiting;
        throwFailed(failed);
    };

    const tracker = sorted !== null
        ? System.create({ name, synced: true, lookup: { list: { index: sorted, read: reads, changed: reads } } }, ({ lookup }) => {
            track(lookup.list(), fromSorted);
        })
        : System.create({ name, synced: true, lookup: { list: { index: keylessOf(has, not), read: reads, changed: reads } } }, ({ lookup }) => {
            track(lookup.list(), fromKeyless);
        });

    /** The scan in progress: its first row starts it. */
    let scanning: Scan | null = null;
    const start = (): Scan | null => {
        const scan = shape.scans[0];
        if (scan === undefined) return null;
        scan.started = true;
        for (const entry of scan.entries) entry.gather.start();
        return scan;
    };
    const scanner = System.create({ name, synced: true, components: { read: reads, has: required.filter(key => !reads.includes(key)), not } }, row => {
        if (scanning === null || scanning !== shape.scans[0] || !scanning.started) scanning = start();
        if (scanning === null) return;
        const { entries } = scanning;
        for (let i = 0; i < entries.length; i++) if (passes(entries[i], row)) entries[i].gather.add(row.entity, row);
    });
    /** Drops entries without subscribers, which nothing keeps current while the shape isn't tracked. */
    const dropUnused = (): void => {
        const { entries } = shape;
        let kept = 0;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.live === 0) shape.byId.delete(entry.id);
            else entries[kept++] = entry;
        }
        entries.length = kept;
    };
    /** Gives the entries a scan read their first values, and tracks those that still have subscribers after. */
    const finish = (): void => {
        const scan = shape.scans.shift();
        if (scan === undefined) return;
        scanning = null;
        let failed: unknown = none;
        let kept = false;
        for (const entry of scan.entries) {
            if (!scan.started) entry.gather.start();
            const count = entry.gather.finish(out);
            entry.value = counting ? count : out.slice(0, count);
            entry.valid = true;
            failed = give(entry, scan.batch, false, state.pass, -1, failed);
            if (entry.live > 0) kept = true;
            // Without a tracker, nothing keeps it current.
            else if (!shape.tracking) entry.valid = false;
        }
        if (kept && !shape.tracking) {
            shape.tracking = true;
            state.world.add(tracker);
        }
        if (!shape.tracking) dropUnused();
        throwFailed(failed);
    };
    const shape: QueryShape = {
        live: 0,
        idle: 0,
        entries: [],
        byId: new Map(),
        scans: [],
        tracking: false,
        waiting: false,
        swept: true,
        read: {
            system: scanner,
            flushed: batch => {
                const waiting = shape.entries.filter(entry => entry.waiting > 0 && !entry.valid);
                shape.scans.push({ batch, started: false, entries: waiting });
                deliverAlso(state, finish);
            },
        },
        remove: () => {
            // Idle for a pass, its entries have no subscribers.
            shape.entries.length = 0;
            shape.byId.clear();
            if (!shape.tracking) return;
            shape.tracking = false;
            state.world.remove(tracker);
        },
    };
    byShape.set(id, shape);
    return shape;
};

/** What gathers an entry's rows, by its shape and page, for scans and trackers through an index without a key. */
const gatherOf = (counting: boolean, terms: readonly Term[], page: Page | null): Gather => {
    if (counting) return createCount();
    if (terms.length === 0) return page === null ? createAll() : createHeap(terms, page);
    return page === null ? createSorted(terms) : createHeap(terms, page);
};

const observeQuery = <T>(world: World, query: AnyQuery, counting: boolean): Observe<T> => {
    const page = counting ? null : query.page ?? null;
    if (page !== null && !(isCount(page.offset) && isCount(page.limit))) {
        throw new Error(`A query's page needs a non-negative integer offset and limit, not ${String(page.offset)} and ${String(page.limit)}.`);
    }
    const required = unique(query.required ?? []);
    // A component both required and excluded matches nothing, which an index can't hold.
    const impossible = (query.not ?? []).some(key => required.includes(key));
    const not = unique((query.not ?? []).filter(key => !required.includes(key)));
    // `where` and `order` name only required components.
    const listed = (object: object | undefined): readonly Component.Key[] => object === undefined ? [] : Object.getOwnPropertySymbols(object).flatMap(symbol => {
        const key = required.find(each => each === symbol);
        return key === undefined || !Object.prototype.propertyIsEnumerable.call(object, key) ? [] : [key];
    });
    const where = [...listed(query.where)].sort(byNumber);
    const terms: Term[] = listed(query.order).map(key => ({ key, ascending: Reflect.get(query.order ?? {}, key) !== false }));
    const conditions = where.map(key => Reflect.get(query.where ?? {}, key));
    const tests = conditions.map(predicateOf);
    const shapeId = `${counting ? "count" : "select"}${impossible ? "!" : ""}|${keysId(required)}|${keysId(not)}|${keysId(where)}|${terms.map(term => `${numberOf(term.key)}${term.ascending ? "+" : "-"}`).join(",")}`;
    const entryId = `${conditions.map(identityOf).join("|")}|${page === null ? "" : `${page.offset},${page.limit}`}`;
    return notify => {
        const state = stateOf(world);
        let byShape = shapes.get(state);
        if (byShape === undefined) shapes.set(state, byShape = new Map());
        const shape = byShape.get(shapeId) ?? createShape(state, byShape, shapeId, counting, impossible, required, not, where, terms);
        let entry = shape.byId.get(entryId);
        if (entry === undefined) {
            entry = { ...createEntry<unknown>(undefined), id: entryId, tests, page, gather: gatherOf(counting, terms, page) };
            shape.byId.set(entryId, entry);
            shape.entries.push(entry);
        }
        const observed = entry;
        // A select's values are lists of entities and a count's numbers, which its callers give `T` by `counting`.
        const typed = observed as Entry<T>;
        const stop = subscribe(state, shape, typed, notify, () => {
            shape.waiting = true;
            if (shape.tracking) scheduleDelivery(state);
            else scheduleRead(state, shape.read);
        });
        return () => {
            if (observed.live > 0) shape.swept = false;
            stop();
        };
    };
};

export const observeSelect = (world: World, query: AnyQuery): Observe<readonly Entity[]> => observeQuery(world, query, false);
export const observeCount = (world: World, query: AnyQuery): Observe<number> => observeQuery(world, query, true);
