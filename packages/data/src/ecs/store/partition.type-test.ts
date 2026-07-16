// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { RequiredComponents } from "../required-components.js";
import { Archetype } from "../archetype/archetype.js";
import {
    PartitionKeysOf,
    HasPartitionKey,
    EnsureArchetypeResult,
    StoreArchetypeHandle,
} from "./partition.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Schemas = {
    id: { type: "integer" };
    position: { type: "number" };
    cell: { type: "integer"; partition: true };
    team: { type: "string"; partition: true };
};

type NoPartitionSchemas = {
    id: { type: "integer" };
    position: { type: "number" };
};

// A schema that names the field but opts out — must NOT count as a partition.
type OptOutSchemas = {
    a: { type: "number"; partition: false };
    b: { type: "number" };
};

type PK = PartitionKeysOf<Schemas>; // "cell" | "team"

type CellRow = RequiredComponents & { cell: number; position: number };
type PosRow = RequiredComponents & { position: number };

// ---------------------------------------------------------------------------
// PartitionKeysOf — positive
// ---------------------------------------------------------------------------

type _keys = Assert<Equal<PartitionKeysOf<Schemas>, "cell" | "team">>;
type _keysNone = Assert<Equal<PartitionKeysOf<NoPartitionSchemas>, never>>;
type _keysOptOut = Assert<Equal<PartitionKeysOf<OptOutSchemas>, never>>;

// PartitionKeysOf — negative: a non-partition column must not be extracted.
// @ts-expect-error - "position" is not declared partition, so this Equal is false
type _keysWrong = Assert<Equal<PartitionKeysOf<Schemas>, "cell" | "team" | "position">>;

// ---------------------------------------------------------------------------
// HasPartitionKey — positive
// ---------------------------------------------------------------------------

type _has = Assert<Equal<HasPartitionKey<"id" | "position" | "cell", PK>, true>>;
type _hasNot = Assert<Equal<HasPartitionKey<"id" | "position", PK>, false>>;

// ---------------------------------------------------------------------------
// EnsureArchetypeResult — positive
// ---------------------------------------------------------------------------

// partition key present, no value → Router
type _r1 = Assert<Equal<EnsureArchetypeResult<CellRow, "cell" | "position", PK, false>, Archetype.Router<CellRow>>>;
// partition key present, value supplied → concrete Archetype (fast path)
type _r2 = Assert<Equal<EnsureArchetypeResult<CellRow, "cell" | "position", PK, true>, Archetype<CellRow>>>;
// no partition key → concrete Archetype (unchanged behavior)
type _r3 = Assert<Equal<EnsureArchetypeResult<PosRow, "position", PK, false>, Archetype<PosRow>>>;

// EnsureArchetypeResult — negative: a partitioned, value-less request is NOT a
// concrete Archetype (that's the whole point — it can't be one).
// @ts-expect-error - this must be a Router, not an Archetype
type _rWrong = Assert<Equal<EnsureArchetypeResult<CellRow, "cell" | "position", PK, false>, Archetype<CellRow>>>;

// ---------------------------------------------------------------------------
// StoreArchetypeHandle — positive
// ---------------------------------------------------------------------------

type _h1 = Assert<Equal<StoreArchetypeHandle<CellRow, "cell" | "position", PK>, Archetype.Router<CellRow>>>;
type _h2 = Assert<Equal<StoreArchetypeHandle<PosRow, "position", PK>, Archetype<PosRow>>>;

// ---------------------------------------------------------------------------
// Runtime-surface guarantees (the load-bearing ergonomics)
// ---------------------------------------------------------------------------

declare const router: Archetype.Router<CellRow>;

// A Router can insert (routing write) ...
router.insert({ cell: 1, position: 2 });
// ... but exposes no dense view:
// @ts-expect-error - a family has no single dense column view
router.columns;
// @ts-expect-error - a family has no row count
router.rowCount;

// The discriminated union (dynamic keys) still permits `.insert` without
// narrowing — both branches share an identical signature ...
declare const handle: Archetype<CellRow> | Archetype.Router<CellRow>;
handle.insert({ cell: 1, position: 2 });
// ... while dense access is correctly gated behind resolving to a concrete
// archetype (supply a value, or narrow):
// @ts-expect-error - .columns requires a concrete Archetype, not a possible family
handle.columns;
