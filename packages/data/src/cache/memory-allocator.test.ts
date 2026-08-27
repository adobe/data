// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import {
  createSimpleMemoryAllocator,
  createWasmMemoryAllocator,
  createSharedArrayBufferAllocator,
  isSharedArrayBufferAllocatorSupported,
  defaultMemoryAllocator,
  MemoryAllocator,
} from "./memory-allocator.js";

describe("createSimpleMemoryAllocator", () => {
  it("allocates a zeroed typed array of the requested length", () => {
    const alloc = createSimpleMemoryAllocator();
    const a = alloc.allocate(Float64Array, 4);
    expect(a).toBeInstanceOf(Float64Array);
    expect(a.length).toBe(4);
    expect(Array.from(a)).toEqual([0, 0, 0, 0]);
  });

  it("hands out an independent buffer per allocation", () => {
    const alloc = createSimpleMemoryAllocator();
    const a = alloc.allocate(Uint32Array, 2);
    const b = alloc.allocate(Uint32Array, 2);
    expect(a.buffer).not.toBe(b.buffer);
  });

  it("refresh is the identity and release / needsRefresh are no-ops", () => {
    const alloc = createSimpleMemoryAllocator();
    const a = alloc.allocate(Int32Array, 3);
    expect(alloc.refresh(a)).toBe(a);
    let fired = false;
    const unsubscribe = alloc.needsRefresh(() => { fired = true; });
    expect(() => alloc.release(a)).not.toThrow();
    expect(fired).toBe(false);
    unsubscribe();
  });

  it("defaultMemoryAllocator is a usable shared instance", () => {
    expect(defaultMemoryAllocator.allocate(Float32Array, 1).length).toBe(1);
  });
});

// Behaviors that every arena (single shared backing buffer) allocator must
// uphold. Run against both the wasm and growable-SharedArrayBuffer backings.
function arenaContract(name: string, make: () => MemoryAllocator) {
  describe(`${name} (arena contract)`, () => {
    it("sub-allocates distinct, non-overlapping regions of ONE backing buffer", () => {
      const alloc = make();
      const a = alloc.allocate(Float64Array, 8);
      const b = alloc.allocate(Float64Array, 8);
      // The whole point: every column is a view into the same shared buffer.
      expect(a.buffer).toBe(b.buffer);
      const aEnd = a.byteOffset + a.byteLength;
      const bEnd = b.byteOffset + b.byteLength;
      expect(a.byteOffset < bEnd && b.byteOffset < aEnd).toBe(false);
    });

    it("hands back zeroed memory even when reusing a freed block", () => {
      const alloc = make();
      const a = alloc.allocate(Uint32Array, 4);
      a.fill(0xdeadbeef);
      alloc.release(a);
      const b = alloc.allocate(Uint32Array, 4);
      expect(Array.from(b)).toEqual([0, 0, 0, 0]);
    });

    it("keeps a second view over the same region observing writes (shared)", () => {
      const alloc = make();
      const a = alloc.allocate(Float64Array, 4);
      const mirror = new Float64Array(a.buffer, a.byteOffset, a.length);
      a[2] = 42;
      expect(mirror[2]).toBe(42);
    });

    it("preserves data across an arena grow", () => {
      const alloc = make();
      // Fill most of the initial page, then allocate enough more to force the
      // backing buffer to grow.
      const first = alloc.allocate(Float64Array, 4096); // 32 KB
      first[0] = 1; first[4095] = 2;
      const second = alloc.allocate(Float64Array, 8192); // 64 KB -> forces grow
      second[0] = 3;
      const firstNow = alloc.refresh(first);
      expect(firstNow[0]).toBe(1);
      expect(firstNow[4095]).toBe(2);
      expect(alloc.refresh(second)[0]).toBe(3);
    });
  });
}

arenaContract("createWasmMemoryAllocator", () =>
  createWasmMemoryAllocator(new WebAssembly.Memory({ initial: 1 })),
);

describe("createWasmMemoryAllocator", () => {
  it("fires needsRefresh and rebuilds a DETACHED view on grow", () => {
    const memory = new WebAssembly.Memory({ initial: 1 }); // 64 KB
    const alloc = createWasmMemoryAllocator(memory);

    // A live view whose holder refreshes on the needsRefresh signal — exactly
    // what a TypedBuffer column does.
    let a = alloc.allocate(Float64Array, 4000); // 32 KB
    a[0] = 111;
    a[3999] = 222;
    let refreshCount = 0;
    alloc.needsRefresh(() => { a = alloc.refresh(a); refreshCount++; });

    // Force memory.grow (which DETACHES every existing view).
    const b = alloc.allocate(Float64Array, 5000); // 40 KB -> 72 KB total > 64 KB
    expect(refreshCount).toBeGreaterThan(0);
    // The refreshed view must recover offset/length/data even though the
    // original was detached to length 0.
    expect(a.byteLength).toBe(4000 * 8);
    expect(a[0]).toBe(111);
    expect(a[3999]).toBe(222);
    expect(b.buffer).toBe(memory.buffer);
  });
});

describe("createSharedArrayBufferAllocator", () => {
  it("reports growable-SharedArrayBuffer support truthfully", () => {
    expect(typeof isSharedArrayBufferAllocatorSupported()).toBe("boolean");
  });

  const maybe = isSharedArrayBufferAllocatorSupported() ? it : it.skip;

  maybe("backs allocations with a growable SharedArrayBuffer", () => {
    const alloc = createSharedArrayBufferAllocator({ initialByteLength: 1024 });
    const a = alloc.allocate(Float64Array, 4);
    expect(a.buffer).toBeInstanceOf(SharedArrayBuffer);
  });

  maybe("grows in place without detaching existing views", () => {
    const alloc = createSharedArrayBufferAllocator({ initialByteLength: 1024, maxByteLength: 1 << 20 });
    const a = alloc.allocate(Float64Array, 64); // 512 bytes
    a[0] = 7;
    const bufferBefore = a.buffer;
    const b = alloc.allocate(Float64Array, 256); // 2 KB -> forces grow past 1 KB
    // A growable SAB grows in place: same buffer object, old view still valid.
    expect(a.buffer).toBe(bufferBefore);
    expect(a.byteLength).toBe(64 * 8);
    expect(a[0]).toBe(7);
    expect(b.buffer).toBe(a.buffer);
  });

  maybe("throws when the arena would exceed its maxByteLength", () => {
    const alloc = createSharedArrayBufferAllocator({ initialByteLength: 1024, maxByteLength: 2048 });
    expect(() => alloc.allocate(Float64Array, 1024)).toThrow(/exhausted|maxByteLength/i);
  });
});

if (isSharedArrayBufferAllocatorSupported()) {
  arenaContract("createSharedArrayBufferAllocator", () =>
    createSharedArrayBufferAllocator({ initialByteLength: 64 * 1024 }),
  );
}
