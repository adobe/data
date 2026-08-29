// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createTypedBuffer } from "./create-typed-buffer.js";
import { TypedBuffer } from "./typed-buffer.js";
import {
  MemoryAllocator,
  createWasmMemoryAllocator,
  createSharedArrayBufferAllocator,
  isSharedArrayBufferAllocatorSupported,
} from "../cache/memory-allocator.js";
import type { Schema } from "../schema/index.js";

// One config per linear-storage buffer kind. `val(i)` is a distinct non-default
// value for row i; `def` is what an untouched row must read back.
interface BufferCase {
  readonly name: string;
  readonly schema: Schema;
  readonly val: (i: number) => unknown;
  readonly def: unknown;
  readonly nonDefault: unknown; // a value guaranteed to differ from `def`
}

const cases: readonly BufferCase[] = [
  { name: "number", schema: { type: "number" }, val: (i) => (i % 97) + 1, def: 0, nonDefault: 42 },
  { name: "integer", schema: { type: "integer", minimum: 0, maximum: 0xffff }, val: (i) => (i % 5000) + 1, def: 0, nonDefault: 4242 },
  {
    name: "struct",
    schema: { type: "object", properties: { x: { type: "number", precision: 1 }, y: { type: "number", precision: 1 } } },
    val: (i) => ({ x: i + 0.5, y: -(i + 0.25) }),
    def: { x: 0, y: 0 },
    nonDefault: { x: 3.5, y: 7.25 },
  },
  { name: "boolean", schema: { type: "boolean" }, val: (i) => i % 2 === 0, def: false, nonDefault: true },
  { name: "enum", schema: { enum: ["a", "b", "c"] }, val: (i) => (["a", "b", "c"] as const)[i % 3], def: "a", nonDefault: "b" },
];

// Allocators to run every buffer case against. `undefined` exercises the default
// (per-column buffer) path.
const allocators: readonly { name: string; make: () => MemoryAllocator | undefined }[] = [
  { name: "default", make: () => undefined },
  { name: "wasm", make: () => createWasmMemoryAllocator(new WebAssembly.Memory({ initial: 1, maximum: 400 })) },
  ...(isSharedArrayBufferAllocatorSupported()
    ? [{ name: "sab", make: () => createSharedArrayBufferAllocator({ initialByteLength: 64 * 1024, maxByteLength: 1 << 24 }) }]
    : []),
];

for (const alloc of allocators) {
  describe(`buffer memory safety — ${alloc.name} allocator`, () => {
    for (const c of cases) {
      describe(c.name, () => {
        it("preserves all written data across repeated grows and defaults the new tail", () => {
          const buffer = createTypedBuffer(c.schema, 4, alloc.make()) as TypedBuffer<unknown>;
          const written = new Map<number, unknown>();
          // Grow through several doublings, writing sparse landmark values and
          // re-verifying EVERY prior write plus a default tail after each grow.
          for (const cap of [4, 9, 40, 300, 5000, 20000]) {
            buffer.capacity = cap;
            // Landmarks: first, last, and a middle row of the current capacity.
            for (const i of [0, (cap >> 1), cap - 1]) {
              buffer.set(i, c.val(i));
              written.set(i, c.val(i));
            }
            for (const [i, v] of written) expect(buffer.get(i)).toEqual(v);
            // A never-written interior row reads the default.
            const untouched = Math.min(cap - 2, (cap >> 1) + 1);
            if (!written.has(untouched)) expect(buffer.get(untouched)).toEqual(c.def);
          }
        });

        it("preserves head data when shrinking capacity", () => {
          const buffer = createTypedBuffer(c.schema, 64, alloc.make()) as TypedBuffer<unknown>;
          for (let i = 0; i < 10; i++) buffer.set(i, c.val(i));
          buffer.capacity = 10; // shrink below the initial capacity
          for (let i = 0; i < 10; i++) expect(buffer.get(i)).toEqual(c.val(i));
        });
      });
    }
  });
}

// ── The "buffers get detached" scenario ──────────────────────────────────────
// A wasm memory grow DETACHES every existing view. A column that is NOT the one
// being grown must still survive, because it refreshes via needsRefresh. Without
// that, reading the bystander column throws or returns garbage.
describe("wasm detach: a bystander column survives another column's grow", () => {
  for (const c of cases) {
    it(`bystander ${c.name} column stays valid and correct`, () => {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 400 });
      const allocator = createWasmMemoryAllocator(memory);
      const grower = createTypedBuffer({ type: "number" }, 4, allocator) as TypedBuffer<unknown>;
      const bystander = createTypedBuffer(c.schema, 8, allocator) as TypedBuffer<unknown>;
      for (let i = 0; i < 8; i++) bystander.set(i, c.val(i));

      // Force memory.grow (detaches everything): 40000 doubles = 320 KB > 64 KB.
      grower.capacity = 40000;

      // The bystander was never touched by the grow, yet must be intact — and its
      // methods must keep working on the refreshed (non-detached) view.
      for (let i = 0; i < 8; i++) expect(bystander.get(i)).toEqual(c.val(i));
      bystander.set(2, c.nonDefault);
      expect(bystander.get(2)).toEqual(c.nonDefault);
      expect(bystander.isDefault(2)).toBe(false);
      // slice + copyWithin still address the live buffer post-detach.
      expect(Array.from(bystander.slice(0, 4)).length).toBe(4);
      bystander.copyWithin(4, 0, 4);
      expect(bystander.get(4)).toEqual(c.val(0));

      // Every live column now shares the current (grown) wasm buffer.
      expect(bystander.getTypedArray().buffer).toBe(memory.buffer);
      expect(grower.getTypedArray().buffer).toBe(memory.buffer);
    });
  }
});

// ── Dispose contract, per buffer kind, per arena allocator ───────────────────
describe("dispose is idempotent and releases the arena block", () => {
  const arenas: readonly { name: string; make: () => MemoryAllocator; sameSize: (b: TypedBuffer<unknown>) => number }[] = [
    { name: "wasm", make: () => createWasmMemoryAllocator(new WebAssembly.Memory({ initial: 1, maximum: 50 })), sameSize: () => 16 },
    ...(isSharedArrayBufferAllocatorSupported()
      ? [{ name: "sab", make: () => createSharedArrayBufferAllocator({ initialByteLength: 64 * 1024 }), sameSize: () => 16 }]
      : []),
  ];
  for (const arena of arenas) {
    for (const c of cases) {
      it(`${arena.name} / ${c.name}: block is reclaimed and double-dispose is safe`, () => {
        const allocator = arena.make();
        const buffer = createTypedBuffer(c.schema, 16, allocator) as TypedBuffer<unknown>;
        const offset = buffer.getTypedArray().byteOffset;
        buffer.dispose();
        // Idempotent — a second dispose must not throw or double-free.
        expect(() => buffer.dispose()).not.toThrow();
        // The freed block is reclaimed: a same-shape buffer reuses the offset.
        const reused = createTypedBuffer(c.schema, 16, allocator) as TypedBuffer<unknown>;
        expect(reused.getTypedArray().byteOffset).toBe(offset);
      });
    }
  }
});
