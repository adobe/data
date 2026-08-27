// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Store } from "./index.js";
import type { Archetype } from "../archetype/index.js";
import { createDatabase } from "../database/index.js";
import {
  createWasmMemoryAllocator,
  createSharedArrayBufferAllocator,
  isSharedArrayBufferAllocatorSupported,
} from "../../cache/memory-allocator.js";
import type { Schema } from "../../schema/index.js";

const position = { type: "object", properties: { x: { type: "number", precision: 1 }, y: { type: "number", precision: 1 } } } as const satisfies Schema;
const hp = { type: "number" } as const satisfies Schema;

describe("createStore with an injected allocator", () => {
  it("routes numeric component storage through a wasm allocator", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const store = Store.create(
      { components: { position, hp }, resources: {}, archetypes: { Mover: ["position", "hp"] } },
      { allocator: createWasmMemoryAllocator(memory) },
    );
    const Mover = store.archetypes.Mover as any;
    const e = Mover.insert({ position: { x: 1, y: 2 }, hp: 50 });

    const arch = store.queryArchetypes(["position", "hp"])[0] as unknown as Archetype<any>;
    // Component columns are views into the shared wasm memory.
    expect(arch.columns.position.getTypedArray().buffer).toBe(memory.buffer);
    expect(arch.columns.hp.getTypedArray().buffer).toBe(memory.buffer);
    // And the data reads back correctly through the store.
    expect(store.read(e)).toEqual({ position: { x: 1, y: 2 }, hp: 50 });
  });

  it("keeps component data correct after growth beyond the initial row capacity", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const store = Store.create(
      { components: { hp }, resources: {}, archetypes: { Unit: ["hp"] } },
      { allocator: createWasmMemoryAllocator(memory) },
    );
    const Unit = store.archetypes.Unit as any;
    const entities = [];
    for (let i = 0; i < 500; i++) entities.push(Unit.insert({ hp: i }));
    for (let i = 0; i < 500; i++) expect(store.read(entities[i])).toEqual({ hp: i });
  });

  it("defaults to per-column buffers when no allocator is injected", () => {
    const store = Store.create({ components: { hp }, resources: {}, archetypes: { Unit: ["hp"] } });
    const Unit = store.archetypes.Unit as any;
    Unit.insert({ hp: 1 });
    Unit.insert({ hp: 2 });
    const arch = store.queryArchetypes(["hp"])[0] as unknown as Archetype<any>;
    // Default storage is a fresh (non-shared) buffer per column, not a shared arena.
    expect(arch.columns.hp.getTypedArray().buffer).not.toBe(arch.columns.id.getTypedArray().buffer);
  });
});

describe("createDatabase with an injected allocator", () => {
  it("threads the allocator into the underlying store's columns", () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const db = createDatabase(
      { components: { hp }, resources: {}, archetypes: { Unit: ["hp"] } } as any,
      { allocator: createWasmMemoryAllocator(memory) },
    ) as any;
    const Unit = db.store.archetypes.Unit as any;
    Unit.insert({ hp: 7 });
    const arch = db.store.queryArchetypes(["hp"])[0] as unknown as Archetype<any>;
    expect(arch.columns.hp.getTypedArray().buffer).toBe(memory.buffer);
  });

  it.skipIf(!isSharedArrayBufferAllocatorSupported())(
    "shares one SharedArrayBuffer across all component columns",
    () => {
      const allocator = createSharedArrayBufferAllocator({ initialByteLength: 64 * 1024 });
      const db = createDatabase(
        { components: { position, hp }, resources: {}, archetypes: { Mover: ["position", "hp"] } } as any,
        { allocator },
      ) as any;
      const Mover = db.store.archetypes.Mover as any;
      Mover.insert({ position: { x: 3, y: 4 }, hp: 9 });
      const arch = db.store.queryArchetypes(["position", "hp"])[0] as unknown as Archetype<any>;
      const positionBuffer = arch.columns.position.getTypedArray().buffer;
      expect(positionBuffer).toBeInstanceOf(SharedArrayBuffer);
      expect(arch.columns.hp.getTypedArray().buffer).toBe(positionBuffer);
    },
  );
});
