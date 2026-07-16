// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createStore } from "../public/create-store.js";
import { compare } from "../../../functions/compare.js";
import type { Entity } from "../../entity/entity.js";

// `cell` and `region` partition; `rank` does not. The partition-aware sort in
// selectEntities must produce output identical to a naive full sort.
const schema = {
    components: {
        cell: { type: "integer", partition: true },
        region: { type: "integer", partition: true },
        rank: { type: "integer" },
    },
    resources: {},
    archetypes: { E: ["cell", "region", "rank"] },
} as const;

type Row = { cell: number; region: number; rank: number };
type Order = { readonly [K in keyof Row]?: boolean };

const makeStore = (rows: readonly Row[]) => {
    const store = createStore(schema);
    const ids = rows.map((r) => store.archetypes.E.insert(r));
    return { store, ids };
};

// Independent reference: read every row and sort by the order keys with the
// same `compare` semantics selectEntities uses.
const referenceSort = (
    store: ReturnType<typeof makeStore>["store"],
    ids: readonly Entity[],
    order: Order,
    where?: (r: Row) => boolean,
): Entity[] => {
    const keys = Object.keys(order) as (keyof Row)[];
    const withVals = ids
        .map((id) => ({ id, r: store.read(id) as unknown as Row }))
        .filter((x) => (where ? where(x.r) : true));
    withVals.sort((a, b) => {
        for (const k of keys) {
            const c = compare(a.r[k], b.r[k]);
            if (c !== 0) return order[k] ? c : -c;
        }
        return 0;
    });
    return withVals.map((x) => x.id);
};

// Rows with a globally-unique `rank` so every order that ends in `rank` is a
// total order (no ties → the reference comparison is unambiguous).
const uniqueRows = (n: number): Row[] =>
    Array.from({ length: n }, (_, i) => ({
        cell: i % 5,
        region: i % 3,
        rank: (i * 7) % n, // a permutation of 0..n-1 (7 and n=100 are coprime)
    }));

describe("selectEntities partition-aware ordering", () => {
    const orders: [string, Order][] = [
        ["sole partition key (cell asc) + rank tiebreak", { cell: true, rank: true }],
        ["partition key descending (cell desc) + rank", { cell: false, rank: true }],
        ["compound partition keys (cell, region) + rank", { cell: true, region: true, rank: true }],
        ["partition then descending secondary (cell asc, rank desc)", { cell: true, rank: false }],
        ["non-partition leading key (rank asc) — fallback path", { rank: true }],
        ["non-partition leading then partition (rank asc, cell asc) — fallback", { rank: true, cell: true }],
    ];

    for (const [name, order] of orders) {
        it(`matches a naive full sort: ${name}`, () => {
            const rows = uniqueRows(100);
            const { store, ids } = makeStore(rows);
            const got = store.select(["cell", "region", "rank"], { order });
            const expected = referenceSort(store, ids, order);
            expect(got).toEqual(expected);
        });
    }

    it("matches a naive full sort with a where filter (cell asc, rank asc)", () => {
        const rows = uniqueRows(100);
        const { store, ids } = makeStore(rows);
        const order: Order = { cell: true, rank: true };
        const got = store.select(["cell", "region", "rank"], { where: { rank: { ">=": 50 } }, order });
        const expected = referenceSort(store, ids, order, (r) => r.rank >= 50);
        expect(got).toEqual(expected);
    });

    it("large K (many distinct partition values) still matches — exercises bucketing at scale", () => {
        // Distinct cell per entity → one bucket each; sole partition order key is
        // the O(N) path (no within-bucket sort).
        const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({ cell: i, region: 0, rank: i }));
        const { store, ids } = makeStore(rows);
        const order: Order = { cell: true };
        expect(store.select(["cell", "region", "rank"], { order })).toEqual(referenceSort(store, ids, order));
    });

    it("with ties on the sole partition key, output is correctly ordered and a permutation of the input", () => {
        // Many entities share each cell value → ties the reference can't
        // disambiguate; assert the weaker invariants instead.
        const rows: Row[] = Array.from({ length: 60 }, (_, i) => ({ cell: i % 4, region: 0, rank: i }));
        const { store, ids } = makeStore(rows);
        const got = store.select(["cell", "region", "rank"], { order: { cell: true } });

        // Non-decreasing by cell.
        for (let i = 1; i < got.length; i++) {
            expect(store.get(got[i - 1], "cell")! <= store.get(got[i], "cell")!).toBe(true);
        }
        // Same set of entities, none lost or duplicated.
        expect([...got].sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    });
});
