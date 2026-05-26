// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compares three Guid storage strategies (write, read, memory) and two Map key
// strategies (string vs bigint) at large N. Run with:
//   npx vitest run src/schema/guid/guid.performance.test.ts

import { describe, it, expect } from "vitest";
import { createStructBuffer } from "../../typed-buffer/index.js";
import { Guid } from "./index.js";

// ─── constants ────────────────────────────────────────────────────────────────

const N_STORAGE = 1_000_000;
const N_MAP = 100_000;

// ─── helpers ──────────────────────────────────────────────────────────────────

const hrNow = (): number => {
    if (typeof process !== "undefined" && process.hrtime?.bigint) {
        return Number(process.hrtime.bigint()) / 1e6; // → ms
    }
    return performance.now();
};

// LCG: deterministic, varied, no crypto overhead, no duplicates up to 2^32
const makeGuid = (i: number): Guid => [
    (i * 1_664_525 + 1_013_904_223) >>> 0,
    (i * 22_695_477 + 1) >>> 0,
    (i * 6_364_136_223 + 1_442_695_037) >>> 0,
    (i * 3_935_559_000 + 2_691_343_689) >>> 0,
];

// Pack [a,b,c,d] u32s into two BigUint64 slots (same 16-byte footprint as struct)
const packHigh = (g: Guid): bigint => (BigInt(g[0]) << 32n) | BigInt(g[1]);
const packLow  = (g: Guid): bigint => (BigInt(g[2]) << 32n) | BigInt(g[3]);

const unpackBigUint = (hi: bigint, lo: bigint): Guid => [
    Number(hi >> 32n),
    Number(hi & 0xFFFFFFFFn),
    Number(lo >> 32n),
    Number(lo & 0xFFFFFFFFn),
];

// Pack all 128 bits into a single BigInt (for heap-array and Map-key variants)
const guidToBigInt = (g: Guid): bigint =>
    (BigInt(g[0]) << 96n) | (BigInt(g[1]) << 64n) | (BigInt(g[2]) << 32n) | BigInt(g[3]);

// Alias for readability in this test file
const { toUnserializableKey } = Guid;

// V8 heap-size estimates (64-bit process, pointer compression off):
//   SeqOneByteString (all chars ≤ 255, e.g. ASCII UUID):
//     ~24-byte header + 1 byte/char, 8-byte aligned  →  36-char UUID ≈ 64 bytes
//   SeqTwoByteString (any char > 255, e.g. our min-string):
//     ~24-byte header + 2 bytes/char, 8-byte aligned →  8-char min  ≈ 40 bytes
//   BigInt 128-bit (2 × 64-bit digits):
//     ~24-byte header + 16 bytes data                →              ≈ 40 bytes
//   Map entry overhead (V8 OrderedHashMap bucket + SmallOrderedHashTable):
//     ≈ 48 bytes per entry regardless of key type
const KEY_MEM_UUID   = 64;  // bytes
const KEY_MEM_BIGINT = 40;  // bytes
const KEY_MEM_MIN    = 40;  // bytes
const MAP_ENTRY_MEM  = 48;  // bytes per entry (key + value pointers + bucket chain)

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const nsPerOp = (ms: number, n: number) => `${(ms * 1e6 / n).toFixed(2)} ns/op`;

// ─── storage: write ───────────────────────────────────────────────────────────

describe(`Guid storage write (N = ${N_STORAGE.toLocaleString()})`, () => {

    it("StructTypedBuffer (4×u32, SharedArrayBuffer)", () => {
        const guids = Array.from({ length: N_STORAGE }, (_, i) => makeGuid(i));
        const buf = createStructBuffer(Guid.schema, N_STORAGE);

        // warmup
        for (let j = 0; j < 10_000; j++) buf.set(j, guids[j]);

        const t0 = hrNow();
        for (let i = 0; i < N_STORAGE; i++) buf.set(i, guids[i]);
        const ms = hrNow() - t0;

        const bytes = buf.typedArrayElementSizeInBytes * N_STORAGE;
        console.log(`  StructTypedBuffer write: ${nsPerOp(ms, N_STORAGE)}  memory: ${mb(bytes)}`);
        expect(ms).toBeGreaterThan(0);
        expect(bytes).toBe(16 * N_STORAGE);
    });

    it("BigUint64Array packed (2×u64, same 16-byte footprint)", () => {
        const guids = Array.from({ length: N_STORAGE }, (_, i) => makeGuid(i));
        const arr = new BigUint64Array(N_STORAGE * 2);

        // warmup
        for (let j = 0; j < 10_000; j++) {
            arr[j * 2] = packHigh(guids[j]);
            arr[j * 2 + 1] = packLow(guids[j]);
        }

        const t0 = hrNow();
        for (let i = 0; i < N_STORAGE; i++) {
            arr[i * 2] = packHigh(guids[i]);
            arr[i * 2 + 1] = packLow(guids[i]);
        }
        const ms = hrNow() - t0;

        console.log(`  BigUint64Array write:    ${nsPerOp(ms, N_STORAGE)}  memory: ${mb(arr.byteLength)}`);
        expect(ms).toBeGreaterThan(0);
        expect(arr.byteLength).toBe(16 * N_STORAGE);
    });

    it("Array<bigint> heap (1×128-bit BigInt per entry)", () => {
        const guids = Array.from({ length: N_STORAGE }, (_, i) => makeGuid(i));
        const arr = new Array<bigint>(N_STORAGE);

        // warmup
        for (let j = 0; j < 10_000; j++) arr[j] = guidToBigInt(guids[j]);

        const t0 = hrNow();
        for (let i = 0; i < N_STORAGE; i++) arr[i] = guidToBigInt(guids[i]);
        const ms = hrNow() - t0;

        // Array<bigint> has no .byteLength; each BigInt object is a V8 heap alloc
        console.log(`  Array<bigint> write:     ${nsPerOp(ms, N_STORAGE)}  memory: heap (each BigInt ~32+ bytes → ~${mb(32 * N_STORAGE)} est.)`);
        expect(ms).toBeGreaterThan(0);
        expect(typeof arr[0]).toBe("bigint");
    });

});

// ─── storage: read ────────────────────────────────────────────────────────────

describe(`Guid storage read (N = ${N_STORAGE.toLocaleString()})`, () => {

    it("StructTypedBuffer (4×u32 → Guid tuple)", () => {
        const guids = Array.from({ length: N_STORAGE }, (_, i) => makeGuid(i));
        const buf = createStructBuffer(Guid.schema, N_STORAGE);
        for (let i = 0; i < N_STORAGE; i++) buf.set(i, guids[i]);

        // warmup
        let sink = 0;
        for (let j = 0; j < 10_000; j++) sink += buf.get(j)[0];

        const t0 = hrNow();
        for (let i = 0; i < N_STORAGE; i++) sink += buf.get(i)[0];
        const ms = hrNow() - t0;

        console.log(`  StructTypedBuffer read:  ${nsPerOp(ms, N_STORAGE)}`);
        expect(sink).toBeGreaterThan(0); // prevent dead-code elimination
    });

    it("BigUint64Array packed (2×u64 → Guid tuple via unpack)", () => {
        const guids = Array.from({ length: N_STORAGE }, (_, i) => makeGuid(i));
        const arr = new BigUint64Array(N_STORAGE * 2);
        for (let i = 0; i < N_STORAGE; i++) {
            arr[i * 2] = packHigh(guids[i]);
            arr[i * 2 + 1] = packLow(guids[i]);
        }

        // warmup
        let sink = 0;
        for (let j = 0; j < 10_000; j++) sink += unpackBigUint(arr[j * 2], arr[j * 2 + 1])[0];

        const t0 = hrNow();
        for (let i = 0; i < N_STORAGE; i++) {
            sink += unpackBigUint(arr[i * 2], arr[i * 2 + 1])[0];
        }
        const ms = hrNow() - t0;

        console.log(`  BigUint64Array read:     ${nsPerOp(ms, N_STORAGE)}`);
        expect(sink).toBeGreaterThan(0);
    });

    it("Array<bigint> heap (128-bit BigInt → Guid tuple via unpack)", () => {
        const guids = Array.from({ length: N_STORAGE }, (_, i) => makeGuid(i));
        const arr = new Array<bigint>(N_STORAGE);
        for (let i = 0; i < N_STORAGE; i++) arr[i] = guidToBigInt(guids[i]);

        // warmup
        let sink = 0;
        for (let j = 0; j < 10_000; j++) {
            const v = arr[j];
            sink += Number(v >> 96n);
        }

        const t0 = hrNow();
        for (let i = 0; i < N_STORAGE; i++) {
            const v = arr[i];
            sink += Number(v >> 96n);
        }
        const ms = hrNow() - t0;

        console.log(`  Array<bigint> read:      ${nsPerOp(ms, N_STORAGE)}`);
        expect(sink).toBeGreaterThan(0);
    });

});

// ─── map key: uuid-string vs bigint vs min-string ────────────────────────────

describe(`Guid Map key comparison (N = ${N_MAP.toLocaleString()})`, () => {

    const totalMem = (keyMem: number) => {
        const bytes = (keyMem + MAP_ENTRY_MEM) * N_MAP;
        return `~${mb(bytes)} total (${keyMem}B/key + ${MAP_ENTRY_MEM}B/entry)`;
    };

    // ── set ──────────────────────────────────────────────────────────────────

    it("Map<string> set — 36-char UUID string", () => {
        const guids = Array.from({ length: N_MAP }, (_, i) => makeGuid(i));
        const keys = guids.map(Guid.toUUID);
        const map = new Map<string, number>();

        for (let j = 0; j < 1_000; j++) map.set(keys[j], j);
        map.clear();

        const t0 = hrNow();
        for (let i = 0; i < N_MAP; i++) map.set(keys[i], i);
        const ms = hrNow() - t0;

        console.log(`  Map<uuid-string>  set: ${nsPerOp(ms, N_MAP)}  mem: ${totalMem(KEY_MEM_UUID)}`);
        expect(map.size).toBe(N_MAP);
    });

    it("Map<bigint> set — 128-bit BigInt", () => {
        const guids = Array.from({ length: N_MAP }, (_, i) => makeGuid(i));
        const keys = guids.map(guidToBigInt);
        const map = new Map<bigint, number>();

        for (let j = 0; j < 1_000; j++) map.set(keys[j], j);
        map.clear();

        const t0 = hrNow();
        for (let i = 0; i < N_MAP; i++) map.set(keys[i], i);
        const ms = hrNow() - t0;

        console.log(`  Map<bigint>       set: ${nsPerOp(ms, N_MAP)}  mem: ${totalMem(KEY_MEM_BIGINT)}`);
        expect(map.size).toBe(N_MAP);
    });

    it("Map<string> set — 8-char min UTF-16 string", () => {
        const guids = Array.from({ length: N_MAP }, (_, i) => makeGuid(i));
        const keys = guids.map(toUnserializableKey);
        const map = new Map<string, number>();

        for (let j = 0; j < 1_000; j++) map.set(keys[j], j);
        map.clear();

        const t0 = hrNow();
        for (let i = 0; i < N_MAP; i++) map.set(keys[i], i);
        const ms = hrNow() - t0;

        console.log(`  Map<min-string>   set: ${nsPerOp(ms, N_MAP)}  mem: ${totalMem(KEY_MEM_MIN)}`);
        expect(map.size).toBe(N_MAP);
    });

    // ── get ──────────────────────────────────────────────────────────────────

    it("Map<string> get — 36-char UUID string", () => {
        const guids = Array.from({ length: N_MAP }, (_, i) => makeGuid(i));
        const keys = guids.map(Guid.toUUID);
        const map = new Map<string, number>(keys.map((k, i) => [k, i]));

        let sink = 0;
        for (let j = 0; j < 1_000; j++) sink += map.get(keys[j])!;

        const t0 = hrNow();
        for (let i = 0; i < N_MAP; i++) sink += map.get(keys[i])!;
        const ms = hrNow() - t0;

        console.log(`  Map<uuid-string>  get: ${nsPerOp(ms, N_MAP)}`);
        expect(sink).toBeGreaterThan(0);
    });

    it("Map<bigint> get — 128-bit BigInt", () => {
        const guids = Array.from({ length: N_MAP }, (_, i) => makeGuid(i));
        const keys = guids.map(guidToBigInt);
        const map = new Map<bigint, number>(keys.map((k, i) => [k, i]));

        let sink = 0;
        for (let j = 0; j < 1_000; j++) sink += map.get(keys[j])!;

        const t0 = hrNow();
        for (let i = 0; i < N_MAP; i++) sink += map.get(keys[i])!;
        const ms = hrNow() - t0;

        console.log(`  Map<bigint>       get: ${nsPerOp(ms, N_MAP)}`);
        expect(sink).toBeGreaterThan(0);
    });

    it("Map<string> get — 8-char min UTF-16 string", () => {
        const guids = Array.from({ length: N_MAP }, (_, i) => makeGuid(i));
        const keys = guids.map(toUnserializableKey);
        const map = new Map<string, number>(keys.map((k, i) => [k, i]));

        let sink = 0;
        for (let j = 0; j < 1_000; j++) sink += map.get(keys[j])!;

        const t0 = hrNow();
        for (let i = 0; i < N_MAP; i++) sink += map.get(keys[i])!;
        const ms = hrNow() - t0;

        console.log(`  Map<min-string>   get: ${nsPerOp(ms, N_MAP)}`);
        expect(sink).toBeGreaterThan(0);
    });

    // ── key encoding cost ─────────────────────────────────────────────────────
    // Measures the conversion from Guid → key, excluding the Map operation itself

    it("key encoding cost — toString vs guidToBigInt vs toUnserializableKey", () => {
        const guids = Array.from({ length: N_MAP }, (_, i) => makeGuid(i));

        // uuid-string
        { let sink = ""; for (let j = 0; j < 1_000; j++) sink += Guid.toUUID(guids[j]).length;
          const t0 = hrNow();
          for (let i = 0; i < N_MAP; i++) sink += Guid.toUUID(guids[i]).length;
          const ms = hrNow() - t0;
          console.log(`  toUUID encode:      ${nsPerOp(ms, N_MAP)}  key len: 36 chars`); expect(sink.length).toBeGreaterThan(0); }

        // bigint
        { let sink = 0n; for (let j = 0; j < 1_000; j++) sink += guidToBigInt(guids[j]);
          const t0 = hrNow();
          for (let i = 0; i < N_MAP; i++) sink += guidToBigInt(guids[i]);
          const ms = hrNow() - t0;
          console.log(`  bigint encode:      ${nsPerOp(ms, N_MAP)}  key len: n/a`); expect(sink).toBeGreaterThan(0n); }

        // min-string
        { let sink = ""; for (let j = 0; j < 1_000; j++) sink += toUnserializableKey(guids[j]).length;
          const t0 = hrNow();
          for (let i = 0; i < N_MAP; i++) sink += toUnserializableKey(guids[i]).length;
          const ms = hrNow() - t0;
          console.log(`  min-string encode:  ${nsPerOp(ms, N_MAP)}  key len: 8 chars`); expect(sink.length).toBeGreaterThan(0); }
    });

});
