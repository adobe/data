// © 2026 Adobe. MIT License. See /LICENSE for details.
import { capacityFor, entryWords, recordCapacity, recordHash, recordKey, recordLength, recordStart } from './index-hash.js';
import { hashWords, orderF32, orderF64 } from './index-keys.js';

// A hash index built again across the pool (design.md, "Indexes"): in steps over fixed pieces of entity indexes and
// fixed partitions of the slot table, each step's pieces or partitions claimed by workers, so what's built doesn't
// depend on how many there are or which ran what. A step reads its plan, and everything it reads and writes, in the
// memory, so it travels through the pool's task rings as a task of `buildKernel`.

/** The kernel number of a build step's task: its phase as the archetype, its pieces or partitions as rows, its plan's address its scalar. */
export const buildKernel = -2;
/** Entity indexes a piece covers. */
export const pieceEntities = 1 << 15;
/** Partitions of the slot table, each a contiguous range of slots, at most. */
export const maximumPartitions = 256;

export type Phase = "count" | "list" | "group" | "fill";
/** Phases by number, as a task's archetype carries them. */
export const phases: readonly Phase[] = ["count", "list", "group", "fill"];

/** A leaf's stored type, as a number a plan carries. */
export const scalarCodes = { f32: 0, i32: 1, u32: 2, boolean: 3, f64: 4 } satisfies { readonly [scalar: string]: number };

/**
 * A build's plan: byte offsets into the memory of what it reads and writes, and small arrays. `members` is by
 * archetype id the archetype's slot among members, or -1; `columns` is by member slot and leaf the byte address of the
 * leaf's column; each leaf has its code, unit stride and offset, and first key word.
 */
export type HashBuild = {
    readonly entityArchetype: number;
    readonly entityRow: number;
    /** Entity indexes from 1 up to this are walked. */
    readonly entityEnd: number;
    readonly pieces: number;
    readonly words: number;
    readonly partitions: number;
    /** A hash's partition: its slot, `hash & mask`, shifted right by this. */
    readonly shift: number;
    readonly mask: number;
    /** By piece and partition: entries, then where the piece's entries of the partition go. */
    readonly histogram: number;
    /** By entry, grouped by partition and in entity order within each: entity index, archetype and row; key words; hash. */
    readonly grouped: number;
    readonly groupedKeys: number;
    readonly groupedHashes: number;
    /** By grouped position: its bucket within its partition. */
    readonly local: number;
    /** By partition: where its positions start (`partitions + 1`), its buckets, their capacity, those of more than one entry, where its buckets and segments start, and its overflowed buckets. */
    readonly starts: number;
    readonly buckets: number;
    readonly capacity: number;
    readonly crowded: number;
    readonly bucketBase: number;
    readonly capacityBase: number;
    readonly overflowed: number;
    /** By grouped position: each of its partition's buckets' first position and length, and those its slots overflowed. */
    readonly first: number;
    readonly lengths: number;
    readonly overflow: number;
    /** The table: slots, records and their stride, ticks by bucket, entries and bucket by entity. */
    readonly slots: number;
    readonly records: number;
    readonly stride: number;
    readonly ticks: number;
    readonly table: number;
    readonly bucketOf: number;
    readonly tick: number;
    /** Whether buckets are placed in their partitions' slots, or all by the world's thread once more were found than the slots hold. */
    readonly placing: boolean;
    readonly members: ArrayLike<number>;
    readonly columns: ArrayLike<number>;
    readonly leafCodes: ArrayLike<number>;
    readonly leafStrides: ArrayLike<number>;
    readonly leafOffsets: ArrayLike<number>;
    readonly leafWords: ArrayLike<number>;
    /** Watched components' ticks by bucket. */
    readonly watched: ArrayLike<number>;
};

/** A plan's numbers, in the order it's written and read; its arrays follow, each its length then its elements. */
const numbersOf = (build: HashBuild): readonly number[] => [
    build.entityArchetype, build.entityRow, build.entityEnd, build.pieces, build.words, build.partitions, build.shift, build.mask, build.histogram, build.grouped, build.groupedKeys, build.groupedHashes, build.local, build.starts,
    build.buckets, build.capacity, build.crowded, build.bucketBase, build.capacityBase, build.overflowed, build.first, build.lengths, build.overflow,
    build.slots, build.records, build.stride, build.ticks, build.table, build.bucketOf, build.tick, build.placing ? 1 : 0,
];
const arraysOf = (build: HashBuild): readonly ArrayLike<number>[] => [build.members, build.columns, build.leafCodes, build.leafStrides, build.leafOffsets, build.leafWords, build.watched];

/** f64 words a plan takes. */
export const planWords = (build: HashBuild): number => {
    let words = numbersOf(build).length;
    for (const array of arraysOf(build)) words += 1 + array.length;
    return words;
};

/** Writes a plan into `f64` from word `at`. */
export const writePlan = (f64: Float64Array, at: number, build: HashBuild): void => {
    let next = at;
    for (const value of numbersOf(build)) f64[next++] = value;
    for (const array of arraysOf(build)) {
        f64[next++] = array.length;
        for (let k = 0; k < array.length; k++) f64[next++] = array[k];
    }
};

/** A plan written at byte `address`, as `numbersOf` and `arraysOf` order it, its arrays views of the memory. */
export const readPlan = (f64: Float64Array, address: number): HashBuild => {
    let next = address >> 3;
    const number = (): number => f64[next++];
    const array = (): Float64Array => {
        const length = f64[next++];
        next += length;
        return f64.subarray(next - length, next);
    };
    return {
        entityArchetype: number(), entityRow: number(), entityEnd: number(), pieces: number(), words: number(), partitions: number(), shift: number(),
        mask: number(), histogram: number(), grouped: number(), groupedKeys: number(),
        groupedHashes: number(), local: number(), starts: number(), buckets: number(), capacity: number(), crowded: number(), bucketBase: number(),
        capacityBase: number(), overflowed: number(), first: number(), lengths: number(), overflow: number(), slots: number(), records: number(),
        stride: number(), ticks: number(), table: number(), bucketOf: number(), tick: number(), placing: number() === 1,
        members: array(), columns: array(), leafCodes: array(), leafStrides: array(), leafOffsets: array(), leafWords: array(), watched: array(),
    };
};

/** Views of the memory a step reads and writes through. */
export type BuildViews = { readonly u8: Uint8Array; readonly u32: Uint32Array; readonly i32: Int32Array; readonly f64: Float64Array };

export const buildViews = (buffer: ArrayBufferLike): BuildViews => ({ u8: new Uint8Array(buffer), u32: new Uint32Array(buffer), i32: new Int32Array(buffer), f64: new Float64Array(buffer) });

/** Scratch of the thread running steps: a piece's partition offsets, a partition's table of buckets, and its buckets' starts and fills. */
const scratch: { offsets: Int32Array; table: Int32Array; hashes: Int32Array; firsts: Int32Array; counts: Int32Array; starts: Int32Array; fills: Int32Array } = {
    offsets: new Int32Array(maximumPartitions), table: new Int32Array(64), hashes: new Int32Array(64), firsts: new Int32Array(64), counts: new Int32Array(64),
    starts: new Int32Array(64), fills: new Int32Array(64),
};

const ensure = (array: Int32Array, length: number): Int32Array => array.length >= length ? array : new Int32Array(Math.max(length, 2 * array.length));

/** Runs one phase of a build over pieces or partitions `from` to `to`. Each phase can run again over the same ones. */
export const runBuildStep = (views: BuildViews, build: HashBuild, phase: Phase, from: number, to: number): void => {
    if (phase === "count" || phase === "list") {
        const step = piecesOf(build);
        if (phase === "count") step.count(views, build, from, to, pair, orderF32, orderF64);
        else step.list(views, build, from, to, pair, orderF32, orderF64, scratch.offsets);
    }
    else if (phase === "group") groupPartitions(views, build, from, to);
    else fillPartitions(views, build, from, to);
};

/** Words for an f64's encoding. */
const pair = new Uint32Array(2);

/**
 * A piece's steps: `count` clears its entities' buckets and counts its members by partition; `list` writes each
 * member's entry, key and hash where its partition's next one goes, from the offsets the world wrote over the counts.
 */
type PieceSteps = {
    readonly count: (views: BuildViews, build: HashBuild, from: number, to: number, pair: Uint32Array, orderF32: (bits: number) => number, orderF64: (high: number, low: number, out: Uint32Array, at: number) => void) => void;
    readonly list: (views: BuildViews, build: HashBuild, from: number, to: number, pair: Uint32Array, orderF32: (bits: number) => number, orderF64: (high: number, low: number, out: Uint32Array, at: number) => void, offsets: Int32Array) => void;
};

/**
 * The statements reading a member's key words from its columns at `row`, `slot` its member slot, into locals `k0`,
 * `k1`... in key order, and hashing them into `hash` as `hashWords` (`index-keys.ts`) does, for the plan's leaves.
 */
const keyStatements = (build: HashBuild): string => {
    const leaves = build.leafCodes.length;
    const lines: string[] = [`const base = slot * ${leaves};`];
    for (let leaf = 0; leaf < leaves; leaf++) {
        const index = `row * ${build.leafStrides[leaf]} + ${build.leafOffsets[leaf]}`;
        const word = build.leafWords[leaf];
        lines.push(`const c${leaf} = columns[base + ${leaf}];`);
        switch (build.leafCodes[leaf]) {
            case 0: lines.push(`const k${word} = orderF32(u32[(c${leaf} >> 2) + ${index}]);`); break;
            case 1: lines.push(`const k${word} = (u32[(c${leaf} >> 2) + ${index}] ^ 0x80000000) >>> 0;`); break;
            case 2: lines.push(`const k${word} = u32[(c${leaf} >> 2) + ${index}];`); break;
            case 3: lines.push(`const k${word} = u8[c${leaf} + ${index}] === 0 ? 0 : 1;`); break;
            default: lines.push(`orderF64(u32[(c${leaf} >> 2) + 2 * (${index}) + 1], u32[(c${leaf} >> 2) + 2 * (${index})], pair, 0);`, `const k${word} = pair[0], k${word + 1} = pair[1];`);
        }
    }
    lines.push("let hash = 0x811C9DC5;");
    for (let w = 0; w < build.words; w++) lines.push(`hash = Math.imul(hash ^ k${w}, 0x9E3779B1); hash ^= hash >>> 15;`);
    lines.push("hash = Math.imul(hash ^ (hash >>> 16), 0x85EBCA6B); hash = Math.imul(hash ^ (hash >>> 13), 0xC2B2AE35); hash = (hash ^ (hash >>> 16)) >>> 0;");
    return lines.join("\n");
};

/** The source of a piece's two steps, for one plan's leaves. */
const pieceSource = (build: HashBuild): string => {
    const loop = (inner: readonly string[]): string => [
        "const archetypes = build.entityArchetype >> 2, rows = build.entityRow >> 2, bucketOf = build.bucketOf >> 2;",
        "const { members, columns, partitions, shift, mask } = build;",
        "const known = members.length, histogram = build.histogram >> 2;",
        "const grouped = build.grouped >> 2, groupedKeys = build.groupedKeys >> 2, groupedHashes = build.groupedHashes >> 2;",
        "for (let piece = from; piece < to; piece++) {",
        `const start = Math.max(1, piece * ${pieceEntities}), end = Math.min(build.entityEnd, (piece + 1) * ${pieceEntities});`,
        "const counted = histogram + piece * partitions;",
        ...inner,
        "}",
    ].join("\n");
    const member = [
        "const archetype = i32[archetypes + entity];",
        "if (archetype < 0 || archetype >= known) continue;",
        "const slot = members[archetype];",
        "if (slot < 0) continue;",
        "const row = u32[rows + entity];",
        keyStatements(build),
    ];
    const count = loop([
        "for (let q = 0; q < partitions; q++) i32[counted + q] = 0;",
        "for (let entity = start; entity < end; entity++) {",
        "i32[bucketOf + entity] = -1;",
        ...member,
        "i32[counted + ((hash & mask) >>> shift)]++;",
        "}",
    ]);
    const list = loop([
        "for (let q = 0; q < partitions; q++) offsets[q] = i32[counted + q];",
        "for (let entity = start; entity < end; entity++) {",
        ...member,
        "const position = offsets[(hash & mask) >>> shift]++;",
        "u32[groupedHashes + position] = hash;",
        `const target = grouped + position * ${entryWords};`,
        "i32[target] = entity; i32[target + 1] = archetype; i32[target + 2] = row;",
        ...Array.from({ length: build.words }, (_, w) => `u32[groupedKeys + position * ${build.words} + ${w}] = k${w};`),
        "}",
    ]);
    return [
        "return {",
        `count: ({ u8, u32, i32 }, build, from, to, pair, orderF32, orderF64) => {\n${count}\n},`,
        `list: ({ u8, u32, i32 }, build, from, to, pair, orderF32, orderF64, offsets) => {\n${list}\n},`,
        "};",
    ].join("\n");
};

/** Whether code can be generated here; a content security policy without `'unsafe-eval'` forbids it. */
let generating = true;
/** Steps by the leaves and key words they're for. */
const generated = new Map<string, PieceSteps>();

/** The steps for a plan's leaves: generated for them, or loops over them where code can't be generated. */
const piecesOf = (build: HashBuild): PieceSteps => {
    if (!generating) return genericSteps;
    const signature = [build.words, ...Array.from(build.leafCodes), ...Array.from(build.leafStrides), ...Array.from(build.leafOffsets), ...Array.from(build.leafWords)].join(",");
    const found = generated.get(signature);
    if (found !== undefined) return found;
    try {
        // The factory returns the steps its source makes, of `PieceSteps`'s shape.
        const steps: PieceSteps = new Function(pieceSource(build))();
        generated.set(signature, steps);
        return steps;
    }
    catch {
        generating = false;
        return genericSteps;
    }
};

/** A member's key words into `key` from its columns at `row`, and their hash. */
const keyOf = ({ u8, u32 }: BuildViews, build: HashBuild, slot: number, row: number, key: Uint32Array): number => {
    const { columns, leafCodes, leafStrides, leafOffsets, leafWords, words } = build;
    const leaves = leafCodes.length;
    for (let leaf = 0; leaf < leaves; leaf++) {
        const column = columns[slot * leaves + leaf];
        const index = row * leafStrides[leaf] + leafOffsets[leaf];
        const word = leafWords[leaf];
        const code = leafCodes[leaf];
        if (code === 2) key[word] = u32[(column >> 2) + index];
        else if (code === 1) key[word] = (u32[(column >> 2) + index] ^ 0x80000000) >>> 0;
        else if (code === 0) key[word] = orderF32(u32[(column >> 2) + index]);
        else if (code === 3) key[word] = u8[column + index] === 0 ? 0 : 1;
        else orderF64(u32[(column >> 2) + 2 * index + 1], u32[(column >> 2) + 2 * index], key, word);
    }
    return hashWords(key, 0, words);
};

const genericKey = new Uint32Array(64);

/** `count` for any leaves. */
const genericCount: PieceSteps["count"] = (views, build, from, to) => {
    const { i32, u32 } = views;
    const archetypes = build.entityArchetype >> 2;
    const rows = build.entityRow >> 2;
    const bucketOf = build.bucketOf >> 2;
    const { members, partitions, shift, mask } = build;
    const key = genericKey.length >= build.words ? genericKey : new Uint32Array(build.words);
    for (let piece = from; piece < to; piece++) {
        const counted = (build.histogram >> 2) + piece * partitions;
        for (let q = 0; q < partitions; q++) i32[counted + q] = 0;
        for (let entity = Math.max(1, piece * pieceEntities), end = Math.min(build.entityEnd, (piece + 1) * pieceEntities); entity < end; entity++) {
            i32[bucketOf + entity] = -1;
            const archetype = i32[archetypes + entity];
            if (archetype < 0 || archetype >= members.length || members[archetype] < 0) continue;
            const hash = keyOf(views, build, members[archetype], u32[rows + entity], key);
            i32[counted + ((hash & mask) >>> shift)]++;
        }
    }
};

/** `list` for any leaves. */
const genericList: PieceSteps["list"] = (views, build, from, to, _pair, _orderF32, _orderF64, offsets) => {
    const { i32, u32 } = views;
    const archetypes = build.entityArchetype >> 2;
    const rows = build.entityRow >> 2;
    const { members, partitions, shift, mask, words } = build;
    const grouped = build.grouped >> 2;
    const groupedKeys = build.groupedKeys >> 2;
    const groupedHashes = build.groupedHashes >> 2;
    const key = genericKey.length >= words ? genericKey : new Uint32Array(words);
    for (let piece = from; piece < to; piece++) {
        const counted = (build.histogram >> 2) + piece * partitions;
        for (let q = 0; q < partitions; q++) offsets[q] = i32[counted + q];
        for (let entity = Math.max(1, piece * pieceEntities), end = Math.min(build.entityEnd, (piece + 1) * pieceEntities); entity < end; entity++) {
            const archetype = i32[archetypes + entity];
            if (archetype < 0 || archetype >= members.length || members[archetype] < 0) continue;
            const row = u32[rows + entity];
            const hash = keyOf(views, build, members[archetype], row, key);
            const position = offsets[(hash & mask) >>> shift]++;
            u32[groupedHashes + position] = hash;
            i32[grouped + position * entryWords] = entity;
            i32[grouped + position * entryWords + 1] = archetype;
            i32[grouped + position * entryWords + 2] = row;
            for (let w = 0; w < words; w++) u32[groupedKeys + position * words + w] = key[w];
        }
    }
};

const genericSteps: PieceSteps = { count: genericCount, list: genericList };

/** Each partition's buckets, in order of their first entry: its positions' buckets there, each bucket's first position and length. */
const groupPartitions = ({ u32, i32 }: BuildViews, build: HashBuild, from: number, to: number): void => {
    const { words } = build;
    const starts = build.starts >> 2;
    const local = build.local >> 2;
    const keys = build.groupedKeys >> 2;
    const hashes = build.groupedHashes >> 2;
    const first = build.first >> 2;
    const lengths = build.lengths >> 2;
    for (let q = from; q < to; q++) {
        const start = i32[starts + q];
        const end = i32[starts + q + 1];
        const entries = end - start;
        let size = 16;
        while (size < 2 * entries) size *= 2;
        // By slot: its bucket, or -1, and that bucket's hash; by bucket: its first position and length.
        const table = scratch.table = ensure(scratch.table, size);
        const slotHashes = scratch.hashes = ensure(scratch.hashes, size);
        const firsts = scratch.firsts = ensure(scratch.firsts, entries);
        const counts = scratch.counts = ensure(scratch.counts, entries);
        table.fill(-1, 0, size);
        const tableMask = size - 1;
        let buckets = 0;
        for (let position = start; position < end; position++) {
            const hash = u32[hashes + position] | 0;
            // A partition's hashes share their partition's bits, so its table probes by the rest.
            let slot = (hash ^ (hash >>> 16)) & tableMask;
            let bucket = -1;
            for (; ; slot = (slot + 1) & tableMask) {
                const found = table[slot];
                if (found < 0) break;
                if (slotHashes[slot] !== hash) continue;
                const other = firsts[found];
                let same = true;
                for (let w = 0; w < words && same; w++) same = u32[keys + other * words + w] === u32[keys + position * words + w];
                if (same) {
                    bucket = found;
                    break;
                }
            }
            if (bucket < 0) {
                bucket = buckets++;
                table[slot] = bucket;
                slotHashes[slot] = hash;
                firsts[bucket] = position;
                counts[bucket] = 0;
            }
            i32[local + position] = bucket;
            counts[bucket]++;
        }
        let capacity = 0;
        let crowded = 0;
        for (let bucket = 0; bucket < buckets; bucket++) {
            const length = counts[bucket];
            i32[first + start + bucket] = firsts[bucket];
            i32[lengths + start + bucket] = length;
            capacity += capacityFor(length);
            if (length > 1) crowded++;
        }
        i32[(build.buckets >> 2) + q] = buckets;
        i32[(build.capacity >> 2) + q] = capacity;
        i32[(build.crowded >> 2) + q] = crowded;
    }
};

/**
 * Each partition's buckets into the table, from where `bucketBase` and `capacityBase` say: records, ticks and slots
 * within the partition's range, those past its end listed for the world's thread; and its entries into their buckets'
 * segments, in entity order, with each entity's bucket.
 */
const fillPartitions = ({ u32, i32, f64 }: BuildViews, build: HashBuild, from: number, to: number): void => {
    const { words, stride, mask, shift, tick, watched, placing } = build;
    const starts = build.starts >> 2;
    const local = build.local >> 2;
    const grouped = build.grouped >> 2;
    const keys = build.groupedKeys >> 2;
    const hashes = build.groupedHashes >> 2;
    const first = build.first >> 2;
    const lengths = build.lengths >> 2;
    const records = build.records >> 2;
    const slots = build.slots >> 2;
    const ticks = build.ticks >> 3;
    const table = build.table >> 2;
    const bucketOf = build.bucketOf >> 2;
    const overflow = build.overflow >> 2;
    for (let q = from; q < to; q++) {
        const start = i32[starts + q];
        const end = i32[starts + q + 1];
        const buckets = i32[(build.buckets >> 2) + q];
        const base = i32[(build.bucketBase >> 2) + q];
        let segment = i32[(build.capacityBase >> 2) + q];
        const segments = scratch.starts = ensure(scratch.starts, buckets);
        const fills = scratch.fills = ensure(scratch.fills, buckets);
        const regionEnd = (q + 1) << shift;
        let overflowed = 0;
        for (let bucket = 0; bucket < buckets; bucket++) {
            const id = base + bucket;
            const length = i32[lengths + start + bucket];
            const position = i32[first + start + bucket];
            const hash = u32[hashes + position];
            const record = records + id * stride;
            u32[record + recordHash] = hash;
            u32[record + recordStart] = segment;
            u32[record + recordLength] = length;
            u32[record + recordCapacity] = capacityFor(length);
            for (let w = 0; w < words; w++) u32[record + recordKey + w] = u32[keys + position * words + w];
            segments[bucket] = segment;
            fills[bucket] = 0;
            segment += capacityFor(length);
            f64[ticks + id] = tick;
            for (let k = 0; k < watched.length; k++) f64[(watched[k] >> 3) + id] = tick;
            if (!placing) continue;
            let slot = hash & mask;
            while (slot < regionEnd && u32[slots + 2 * slot + 1] !== 0) slot++;
            if (slot === regionEnd) i32[overflow + start + overflowed++] = id;
            else {
                u32[slots + 2 * slot] = hash;
                u32[slots + 2 * slot + 1] = id + 1;
            }
        }
        i32[(build.overflowed >> 2) + q] = overflowed;
        for (let position = start; position < end; position++) {
            const bucket = i32[local + position];
            const at = table + (segments[bucket] + fills[bucket]++) * entryWords;
            const source = grouped + position * entryWords;
            const entity = i32[source];
            i32[at] = entity;
            i32[at + 1] = i32[source + 1];
            i32[at + 2] = i32[source + 2];
            i32[bucketOf + entity] = base + bucket;
        }
    }
};
