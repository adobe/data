// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createTypedBuffer } from "./create-typed-buffer.js";
import {
  createWasmMemoryAllocator,
  createSharedArrayBufferAllocator,
  isSharedArrayBufferAllocatorSupported,
  MemoryAllocator,
} from "../cache/memory-allocator.js";
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
