import { Index, System, type Component, type Entity, type World } from '../index.js';
import { compare, predicateOf } from './compare.js';
import type { Observe } from './observe.js';
import { createAll, createCount, createHeap, createSorted, type Gather, type Page, type Term, type Values } from './plans.js';
import {
    createEntry, deliverAlso, give, keysId, labelOf, none, numberOf, scheduleDelivery, scheduleRead, stateOf, subscribe, sweepSubscribers, throwFailed,
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

/** No range: a ranged shape's entry whose condition on the ranged key bounds nothing an index can, such as `"!="`. */
const noRange: unique symbol = Symbol("Observe/noRange");

/**
 * A query's observers with one `where` and page: its value, its `where` tests in its shape's order, and what gathers
 * it. Through a sorted index on one `where` key, its range there: its condition with each bound made inclusive, which
 * holds every row the condition passes whatever the precision values are kept at; and, for a count it gives alone, the
 * lookups of the rows at each bound, which only the condition's own test can tell apart.
 */
type QueryEntry = Entry<unknown> & {
    readonly id: string;
    readonly tests: readonly ((value: unknown) => boolean)[];
    readonly page: Page | null;
    readonly gather: Gather;
    readonly range: Bound | typeof noRange;
    readonly bounds: readonly Bound[] | null;
};

/**
 * A scan for cold first values, of the entries waiting for one flush's: started by its first row, in its run, and
 * finished in the delivering run after it, which runs before anything else could change the world.
 */
type Scan = { readonly batch: number; started: boolean; readonly entries: QueryEntry[] };

/**
 * The observers of one shape of query, its components, `where` keys and `order`, each `where` and page an entry. Cold
 * first values come from a scan of its rows while no subscriber outlived its first value; then `tracker`, added, keeps
 * every entry's value through an index: a sorted one on `order` when every term goes one direction; else, for a count
 * or a selection without a page, a sorted one on its first `where` key whose values have an order, each entry looking
 * up its range; else one without a key, of what matches.
 */
type QueryShape = Shape & {
    readonly entries: QueryEntry[];
    readonly byId: Map<string, QueryEntry>;
    readonly read: Read;
    readonly scans: Scan[];
    /** The position in `where` of the key the tracker's index is sorted by, or -1. */
    readonly ranged: number;
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

const operators = new Set(["==", "!=", "<", ">", "<=", ">="]);

/**
 * A condition's range as a sorted index's lookup takes it, every bound inclusive, so it holds every row the condition
 * passes at whatever precision the index keeps values; with each bound, or noRange where it bounds nothing an index
 * can. `exact` is whether the range holds no more than rows at its bounds: no `"!="` was left out.
 */
type Range = { readonly range: Bound | typeof noRange; readonly bounds: readonly Value[]; readonly exact: boolean };
const unbounded: Range = { range: noRange, bounds: [], exact: false };

const rangeOf = (condition: unknown): Range => {
    if (isValue(condition)) return { range: condition, bounds: [condition], exact: true };
    if (typeof condition !== "object" || condition === null) return unbounded;
    const entries = Object.entries(condition);
    if (entries.length === 0 || !entries.every(([operator]) => operators.has(operator))) return unbounded;
    const range: { "<="?: Value; ">="?: Value; "=="?: Value } = {};
    const bounds: Value[] = [];
    let exact = true;
    for (const [operator, operand] of entries) {
        if (operator === "!=" || !isValue(operand)) {
            exact = false;
            continue;
        }
        if (operator === "<" || operator === "<=") range["<="] = operand;
        else if (operator === ">" || operator === ">=") range[">="] = operand;
        else range["=="] = operand;
        bounds.push(operand);
    }
    return bounds.length === 0 ? unbounded : { range, bounds, exact };
};

type Value = Component.Value<Component.Key>;

/** A value or comparison a sorted index on one key part looks up by. */
type Bound = Value | { readonly "<="?: Value; readonly ">="?: Value; readonly "=="?: Value };

/**
 * Whether a `where` operand is a value of a part a sorted index orders: a number, boolean, string, entity or tuple of
 * them, never a plain object, which would be a comparison.
 */
const isValue = (operand: unknown): operand is Value =>
    operand !== undefined && (typeof operand !== "object" || Array.isArray(operand));

/** A sorted index on one key part, or null where one can't be. */
const rangedOf = (key: Component.Key, has: readonly Component.Key[], not: readonly Component.Key[]) => {
    const id = `${keysId([key])}|${keysId(has)}|${keysId(not)}`;
    let index = rangedIndexes.get(id);
    if (index === undefined) {
        try {
            index = Index.create({ name: `Observe.query(${labelOf(has)}) by ${labelOf([key])}`, key: [key], sorted: true, components: { has: [...has], not: excluding(not, [key, ...has]) } });
        }
        catch {
            index = null;
        }
        rangedIndexes.set(id, index);
    }
    return index;
};
const rangedIndexes = new Map<string, Index<{ readonly key: readonly [Component.Key]; readonly sorted: true; readonly components: { readonly has: readonly Component.Key[]; readonly not: readonly Component.Key[] } }> | null>();

const createShape = (state: WorldState, byShape: Map<string, QueryShape>, id: string, counting: boolean, impossible: boolean, paged: boolean, required: readonly Component.Key[], not: readonly Component.Key[], where: readonly Component.Key[], terms: readonly Term[]): QueryShape => {
    const reads = unique([...where, ...terms.map(term => term.key)]);
    const has = unique([...required, ...reads]);
    const name = `Observe.${counting ? "count" : "select"}(${labelOf(required)})`;
    const direction = terms.length > 0 && terms.every(term => term.ascending === terms[0].ascending) ? terms[0].ascending : null;
    const sortedKey = terms.map(term => term.key);
    const ordered = !counting && direction !== null ? sortedOf(sortedKey, has.filter(key => !sortedKey.includes(key)), not) : null;
    let ranged = -1;
    let byRange: ReturnType<typeof rangedOf> = null;
    if (ordered === null && (counting || !paged || terms.length > 0)) {
        for (let r = 0; r < where.length && byRange === null; r++) {
            byRange = rangedOf(where[r], has.filter(key => key !== where[r]), not);
            if (byRange !== null) ranged = r;
        }
    }
    /** Reused for results being compared with the last. */
    const out: Entity[] = [];

    const passes = (entry: QueryEntry, values: Values): boolean => {
        if (impossible) return false;
        const { tests } = entry;
        for (let k = 0; k < tests.length; k++) if (!tests[k](values[where[k]])) return false;
        return true;
    };

    /** Gathers the rows of a list that pass an entry's `where`, writing its result into `out`; returns its length or count. */
    const gathered = (entry: QueryEntry, rows: Rows): number => {
        const length = impossible ? 0 : rows.length;
        const { gather } = entry;
        gather.start();
        for (let i = 0; i < length; i++) {
            const row = rows.at(i);
            if (passes(entry, row)) gather.add(row.entity, row);
        }
        return gather.finish(out);
    };

    /** Writes an entry's result into `out` through a list of rows in entity order, and returns its length or count. */
    const fromKeyless = (entry: QueryEntry, rows: Rows): number => {
        const length = impossible ? 0 : rows.length;
        if (counting && entry.tests.length === 0) return length;
        if (counting || terms.length > 0) return gathered(entry, rows);
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

    /** A run of rows with equal keys, read from its last, passing `where`: their entities, highest position first. */
    let run = new Float64Array(64);
    /** The key of the run in progress, by term. */
    const tie: unknown[] = terms.map(() => undefined);
    const sameKey = (values: Values): boolean => {
        for (let t = 0; t < terms.length; t++) if (compare(values[terms[t].key], tie[t]) !== 0) return false;
        return true;
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
        // Descending: from the last row, each run of equal keys gathered, then given in entity order, its first position first.
        let held = 0;
        for (let i = length - 1; i >= -1 && n < limit; i--) {
            const row = i < 0 ? null : rows.at(i);
            if (row === null || i === length - 1 || !sameKey(row)) {
                for (let k = held - 1; k >= 0 && n < limit; k--) {
                    if (skip > 0) skip--;
                    else out[n++] = entityOf(run[k]);
                }
                held = 0;
                if (row === null) break;
                for (let t = 0; t < terms.length; t++) tie[t] = row[terms[t].key];
            }
            if (filtered && !passes(entry, row)) continue;
            if (held === run.length) {
                const grown = new Float64Array(2 * run.length);
                grown.set(run);
                run = grown;
            }
            run[held++] = row.entity;
        }
        return n;
    };

    /** Writes an entry's result into `out` through its range of a sorted index on one `where` key; returns its length or count. */
    const fromRange = (entry: QueryEntry, rows: Rows, find: (range: Bound) => Rows): number => {
        const { bounds } = entry;
        if (impossible) return 0;
        // A count of one condition: the range's length, less the rows at a bound the condition doesn't pass. Rows at a
        // bound share its key, so its value: one tells for all.
        if (bounds === null) return gathered(entry, rows);
        const total = rows.length;
        if (total === 0) return 0;
        if (entry.range === bounds[0] && bounds.length === 1) return entry.tests[0](rows.at(0)[where[0]]) ? total : 0;
        let count = total;
        let counted = -1;
        for (let b = 0; b < bounds.length; b++) {
            const at = find(bounds[b]);
            if (at.length === 0) continue;
            const first = at.at(0);
            // Two bounds the index keeps at one key are one run.
            if (first.entity === counted) continue;
            counted = first.entity;
            if (!entry.tests[0](first[where[0]])) count -= at.length;
        }
        return count;
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

    /**
     * Keeps every entry's value: through `rows`, one list for all, or each entry's own, `own`; with nothing changed,
     * gives waiting subscribers theirs.
     */
    const track = (rows: Rows | null, own: ((entry: QueryEntry) => number) | null, from: (entry: QueryEntry, rows: Rows) => number): void => {
        if (!shape.swept) shape.swept = !sweep();
        const changed = rows === null || rows.changed;
        if (!changed && !shape.waiting) return;
        const through = state.delivered;
        const { entries } = shape;
        let failed: unknown = none;
        let waiting = false;
        for (let i = 0, count = entries.length; i < count; i++) {
            const entry = entries[i];
            if (own !== null) {
                const result = own(entry);
                if (result >= 0 || entry.waiting > 0) failed = give(entry, through, result >= 0 && settle(entry, result), state.pass, -1, failed);
            }
            else if (rows !== null && (changed || (entry.waiting > 0 && !entry.valid))) failed = give(entry, through, settle(entry, from(entry, rows)), state.pass, -1, failed);
            else if (entry.waiting > 0) failed = give(entry, through, false, state.pass, -1, failed);
            if (entry.waiting > 0) waiting = true;
        }
        shape.waiting = waiting;
        throwFailed(failed);
    };

    /** An entry's result through its range, or -1 while it's valid and nothing in its range changed. */
    const ownRange = (entry: QueryEntry, find: (range: Bound) => Rows, all: () => Rows): number => {
        const rows = entry.range === noRange ? all() : find(entry.range);
        if (entry.valid && !rows.changed) return -1;
        return entry.range === noRange ? gathered(entry, rows) : fromRange(entry, rows, find);
    };

    const tracker = ordered !== null
        ? System.create({ name, synced: true, lookup: { list: { index: ordered, read: reads, changed: reads } } }, ({ lookup }) => {
            track(lookup.list(), null, fromSorted);
        })
        : byRange !== null
            ? System.create({ name, synced: true, lookup: { list: { index: byRange, read: reads, changed: reads } } }, ({ lookup }) => {
                // A range is of a `where` condition on the index's key, which the query's type checked against its values.
                track(null, entry => ownRange(entry, range => lookup.list(range as Parameters<typeof lookup.list>[0]), () => lookup.list()), fromSorted);
            })
            : System.create({ name, synced: true, lookup: { list: { index: keylessOf(has, not), read: reads, changed: reads } } }, ({ lookup }) => {
                track(lookup.list(), null, fromKeyless);
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
        ranged,
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

// Entities are numbers the world gave out, held as they were in typed scratch.
const entityOf = (value: number): Entity => value as Entity;

/** What gathers an entry's rows, by its shape and page, for scans and trackers through an index without a key. */
const gatherOf = (counting: boolean, terms: readonly Term[], page: Page | null): Gather => {
    if (counting) return createCount();
    if (terms.length === 0) return page === null ? createAll() : createHeap(terms, page);
    return page === null ? createSorted(terms) : createHeap(terms, page);
};

/** An entry of a shape, for its `where` conditions and page. */
const createQueryEntry = (shape: QueryShape, id: string, counting: boolean, terms: readonly Term[], conditions: readonly unknown[], page: Page | null): QueryEntry => {
    const tests = conditions.map(predicateOf);
    const { range, bounds, exact } = shape.ranged < 0 ? unbounded : rangeOf(conditions[shape.ranged]);
    // The count of one condition takes the range's length and its bounds' rows; any other result gathers its rows.
    const counted = counting && exact && conditions.length === 1;
    const lookups: readonly Bound[] | null = !counted || range === noRange ? null : isValue(range) ? [range] : bounds.map((bound): Bound => ({ ...range, "==": bound }));
    return { ...createEntry<unknown>(undefined), id, tests, page, gather: gatherOf(counting, terms, page), range, bounds: lookups };
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
    const shapeId = `${counting ? "count" : "select"}${impossible ? "!" : ""}${page === null ? "" : "#"}|${keysId(required)}|${keysId(not)}|${keysId(where)}|${terms.map(term => `${numberOf(term.key)}${term.ascending ? "+" : "-"}`).join(",")}`;
    const entryId = `${conditions.map(identityOf).join("|")}|${page === null ? "" : `${page.offset},${page.limit}`}`;
    return notify => {
        const state = stateOf(world);
        let byShape = shapes.get(state);
        if (byShape === undefined) shapes.set(state, byShape = new Map());
        const shape = byShape.get(shapeId) ?? createShape(state, byShape, shapeId, counting, impossible, page !== null, required, not, where, terms);
        let entry = shape.byId.get(entryId);
        if (entry === undefined) {
            entry = createQueryEntry(shape, entryId, counting, terms, conditions, page);
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
