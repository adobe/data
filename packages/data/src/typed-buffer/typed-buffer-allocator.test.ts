// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createTypedBuffer } from "./create-typed-buffer.js";
import {
  createWasmMemoryAllocator,
  createSharedArrayBufferAllocator,
  isSharedArrayBufferAllocatorSupported,
  MemoryAllocator,
} from "../cache/memory-allocator.js";
import { TypedArray } from "../internal/typed-array/index.js";
import type { Schema } from "../schema/index.js";

const numberSchema = { type: "number" } as const satisfies Schema;
const booleanSchema = { type: "boolean" } as const satisfies Schema;
const enumSchema = { enum: ["a", "b", "c"] } as const satisfies Schema;
const structSchema = {
  type: "object",
  properties: { x: { type: "number", precision: 1 }, y: { type: "number", precision: 1 } },
} as const satisfies Schema;

// Every arena-backed storage buffer must survive a grow that reallocates its
// region — writes made before the grow must read back unchanged after it.
function growPreservesData(make: () => MemoryAllocator) {
  it("number buffer preserves data across a capacity grow", () => {
    const buffer = createTypedBuffer(numberSchema, 4, make());
    for (let i = 0; i < 4; i++) buffer.set(i, i * 10);
    buffer.capacity = 4096; // forces reallocation (and possibly an arena grow)
    for (let i = 0; i < 4; i++) expect(buffer.get(i)).toBe(i * 10);
    buffer.set(4095, 999);
    expect(buffer.get(4095)).toBe(999);
  });

  it("struct buffer preserves data across a capacity grow", () => {
    const buffer = createTypedBuffer(structSchema, 4, make());
    buffer.set(1, { x: 1.5, y: 2.5 });
    buffer.capacity = 4096;
    expect(buffer.get(1)).toEqual({ x: 1.5, y: 2.5 });
  });

  it("boolean buffer preserves data across a capacity grow", () => {
    const buffer = createTypedBuffer(booleanSchema, 4, make());
    buffer.set(0, true);
    buffer.set(3, true);
    buffer.capacity = 4096;
    expect(buffer.get(0)).toBe(true);
    expect(buffer.get(1)).toBe(false);
    expect(buffer.get(3)).toBe(true);
    expect(buffer.get(2000)).toBe(false);
  });

  it("enum buffer preserves data across a capacity grow", () => {
    const buffer = createTypedBuffer(enumSchema, 4, make());
    buffer.set(2, "c");
    buffer.capacity = 4096;
    expect(buffer.get(2)).toBe("c");
    expect(buffer.get(0)).toBe("a");
  });
}

describe("createTypedBuffer with a wasm allocator", () => {
  growPreservesData(() => createWasmMemoryAllocator(new WebAssembly.Memory({ initial: 1 })));

  it("backs numeric storage with the shared wasm memory buffer", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const buffer = createTypedBuffer(numberSchema, 4, createWasmMemoryAllocator(memory));
    expect(buffer.getTypedArray().buffer).toBe(memory.buffer);
  });
});

// A MemoryAllocator that tracks live needsRefresh subscribers, so a leak (a
// buffer that never unsubscribes) is directly observable.
function recordingAllocator() {
  const subscribers = new Set<() => void>();
  const allocator: MemoryAllocator = {
    needsRefresh: (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    allocate: <T extends TypedArray>(
      ctor: { BYTES_PER_ELEMENT: number } & (new (b?: ArrayBufferLike, o?: number, l?: number) => T),
      n: number,
    ): T => new ctor(new ArrayBuffer(n * ctor.BYTES_PER_ELEMENT), 0, n),
    refresh: (a) => a,
    release: () => { },
  };
  return { allocator, subscriberCount: () => subscribers.size };
}

describe("TypedBuffer.dispose", () => {
  it("releases the arena block so a same-size allocation reuses it", () => {
    const alloc = createWasmMemoryAllocator(new WebAssembly.Memory({ initial: 1 }));
    const a = createTypedBuffer(numberSchema, 4, alloc);
    const offset = a.getTypedArray().byteOffset;
    a.dispose();
    const b = createTypedBuffer(numberSchema, 4, alloc);
    expect(b.getTypedArray().byteOffset).toBe(offset);
  });

  it("unsubscribes from needsRefresh (no leaked subscription)", () => {
    const { allocator, subscriberCount } = recordingAllocator();
    const buffer = createTypedBuffer(numberSchema, 4, allocator);
    expect(subscriberCount()).toBe(1);
    buffer.dispose();
    expect(subscriberCount()).toBe(0);
  });

  it("is a no-op for buffers without linear storage (const)", () => {
    const constBuffer = createTypedBuffer({ const: 5 } as const satisfies Schema, 4);
    expect(() => constBuffer.dispose()).not.toThrow();
  });

  it("applies to struct, boolean and enum buffers too", () => {
    const { allocator, subscriberCount } = recordingAllocator();
    const buffers = [
      createTypedBuffer(structSchema, 4, allocator),
      createTypedBuffer(booleanSchema, 4, allocator),
      createTypedBuffer(enumSchema, 4, allocator),
    ];
    expect(subscriberCount()).toBe(3);
    for (const b of buffers) b.dispose();
    expect(subscriberCount()).toBe(0);
  });
});

describe.skipIf(!isSharedArrayBufferAllocatorSupported())(
  "createTypedBuffer with a growable SharedArrayBuffer allocator",
  () => {
    growPreservesData(() => createSharedArrayBufferAllocator({ initialByteLength: 4096 }));

    it("backs numeric storage with a SharedArrayBuffer shared across columns", () => {
      const allocator = createSharedArrayBufferAllocator({ initialByteLength: 64 * 1024 });
      const a = createTypedBuffer(numberSchema, 4, allocator);
      const b = createTypedBuffer(structSchema, 4, allocator);
      expect(a.getTypedArray().buffer).toBeInstanceOf(SharedArrayBuffer);
      // Two different columns share ONE backing buffer — the zero-copy foundation.
      expect(a.getTypedArray().buffer).toBe(b.getTypedArray().buffer);
    });
  },
);
