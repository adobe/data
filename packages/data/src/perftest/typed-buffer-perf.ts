// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createNumberBuffer } from "../typed-buffer/create-number-buffer.js";
import { createArrayBuffer } from "../typed-buffer/create-array-buffer.js";
import { createStructBuffer } from "../typed-buffer/create-struct-buffer.js";
import { F32 } from "../math/f32/index.js";
import type { Schema } from "../schema/index.js";
import type { PerformanceTest } from "./perf-test.js";
import { createManagedArray } from "../cache/managed-array.js";
import { createSimpleMemoryAllocator } from "../cache/memory-allocator.js";

const Vec3Schema: Schema = {
    type: "object",
    properties: {
        x: F32.schema,
        y: F32.schema,
        z: F32.schema,
    },
    required: ["x", "y", "z"],
} as const;

type Vec3 = { x: number; y: number; z: number };

// number buffer get+set sweep — direct typed-array baseline through TypedBuffer.
const numberBufferGetSet = (): PerformanceTest => {
    let buffer: ReturnType<typeof createNumberBuffer>;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        buffer = createNumberBuffer(F32.schema, n);
        for (let i = 0; i < n; i++) {
            buffer.set(i, i + 1);
        }
    };
    const run = () => {
        let total = 0;
        for (let i = 0; i < count; i++) {
            total += buffer.get(i);
        }
        sink ^= total | 0;
        for (let i = 0; i < count; i++) {
            buffer.set(i, buffer.get(i) + 1);
        }
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move" };
};

// array buffer get+set with object payloads — non-typed-array baseline.
const arrayBufferGetSet = (): PerformanceTest => {
    let buffer: ReturnType<typeof createArrayBuffer<typeof Vec3Schema, Vec3>>;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        buffer = createArrayBuffer<typeof Vec3Schema, Vec3>(Vec3Schema, n);
        for (let i = 0; i < n; i++) {
            buffer.set(i, { x: i + 1, y: i + 1, z: i + 1 });
        }
    };
    const run = () => {
        let total = 0;
        for (let i = 0; i < count; i++) {
            const v = buffer.get(i);
            total += v.x + v.y + v.z;
        }
        sink ^= total | 0;
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move" };
};

// struct_get — read every element and accumulate a sink to defeat DCE.
const structBufferGet = (): PerformanceTest => {
    let buffer: ReturnType<typeof createStructBuffer<typeof Vec3Schema>>;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        buffer = createStructBuffer(Vec3Schema, n);
        for (let i = 0; i < n; i++) {
            buffer.set(i, { x: i + 1, y: i + 2, z: i + 3 });
        }
    };
    const run = () => {
        let total = 0;
        for (let i = 0; i < count; i++) {
            const v = buffer.get(i) as Vec3;
            total += v.x + v.y + v.z;
        }
        sink ^= total | 0;
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move" };
};

// struct_set — write every element from a fixed literal.
const structBufferSet = (): PerformanceTest => {
    let buffer: ReturnType<typeof createStructBuffer<typeof Vec3Schema>>;
    let count = 0;
    const literal = { x: 1, y: 2, z: 3 };
    const setup = async (n: number) => {
        count = n;
        buffer = createStructBuffer(Vec3Schema, n);
    };
    const run = () => {
        for (let i = 0; i < count; i++) {
            buffer.set(i, literal);
        }
    };
    const cleanup = async () => { };
    return { setup, run, cleanup, type: "move" };
};

// struct_round_trip — get, mutate, set. Mirrors the per-frame ECS pattern.
const structBufferRoundTrip = (): PerformanceTest => {
    let buffer: ReturnType<typeof createStructBuffer<typeof Vec3Schema>>;
    let count = 0;
    const setup = async (n: number) => {
        count = n;
        buffer = createStructBuffer(Vec3Schema, n);
        for (let i = 0; i < n; i++) {
            buffer.set(i, { x: i + 1, y: i + 1, z: i + 1 });
        }
    };
    const run = () => {
        for (let i = 0; i < count; i++) {
            const v = buffer.get(i) as Vec3;
            v.x += 1;
            v.y += 1;
            v.z += 1;
            buffer.set(i, v);
        }
    };
    const cleanup = async () => { };
    return { setup, run, cleanup, type: "move" };
};

// Bisecting variants of an inline column class to find what makes
// ManagedTypedArrayColumn 40× slower than NumberTypedBuffer at the same
// per-element workload (N=1M, positionX += velocityX).
//
// Each variant differs from IsolatedColumnA by exactly one feature.
// Whichever variant goes from ~1 ns/op to ~40 ns/op is the culprit.

class IsolatedColumnA {
    array: Float32Array;
    constructor(n: number) { this.array = new Float32Array(n); }
    get(index: number): number { return this.array[index]; }
    set(index: number, value: number): void { this.array[index] = value; }
}

// + extra fields (ctor, capacity, allocator-stand-in)
class IsolatedColumnB {
    array: Float32Array;
    ctor: any;
    capacity: number;
    allocator: any;
    constructor(n: number) {
        this.ctor = Float32Array;
        this.allocator = {};
        this.capacity = n;
        this.array = new Float32Array(n);
    }
    get(index: number): number { return this.array[index]; }
    set(index: number, value: number): void { this.array[index] = value; }
}

// + needsRefresh-style closure capturing this and (potentially) reassigning this.array
class IsolatedColumnC {
    array: Float32Array;
    ctor: any;
    capacity: number;
    allocator: { needsRefresh: (cb: () => void) => () => void };
    constructor(n: number) {
        this.ctor = Float32Array;
        this.allocator = { needsRefresh: () => () => { } };
        this.capacity = n;
        this.array = new Float32Array(n);
        this.allocator.needsRefresh(() => {
            this.array = this.array;
        });
    }
    get(index: number): number { return this.array[index]; }
    set(index: number, value: number): void { this.array[index] = value; }
}

// + array typed as union of TypedArray subclasses (matches ManagedTypedArrayColumn signature)
type AnyTA = Float32Array | Float64Array | Int32Array | Uint32Array | Uint8Array | Uint16Array | Int8Array | Int16Array;
class IsolatedColumnD {
    array: AnyTA;
    constructor(n: number) { this.array = new Float32Array(n); }
    get(index: number): number { return this.array[index]; }
    set(index: number, value: number): void { this.array[index] = value; }
}

// All of B + C + D combined: extra fields, closure capturing this, union typed array.
// Should match ManagedTypedArrayColumn's behavior if those are the only factors.
class IsolatedColumnE {
    array: AnyTA;
    ctor: any;
    capacity: number;
    allocator: { needsRefresh: (cb: () => void) => () => void };
    constructor(n: number) {
        this.ctor = Float32Array;
        this.allocator = { needsRefresh: () => () => { } };
        this.capacity = n;
        this.array = new Float32Array(n);
        this.allocator.needsRefresh(() => {
            this.array = this.array;
        });
    }
    get(index: number): number { return this.array[index]; }
    set(index: number, value: number): void { this.array[index] = value; }
}

function makeIsolatedTest<C extends { get(i: number): number; set(i: number, v: number): void }>(
    factory: (n: number) => C
): PerformanceTest {
    let positionX: C;
    let velocityX: C;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        positionX = factory(n);
        velocityX = factory(n);
        for (let i = 0; i < n; i++) {
            positionX.set(i, i + 1);
            velocityX.set(i, -i);
        }
    };
    const run = () => {
        for (let i = 0; i < count; i++) {
            positionX.set(i, positionX.get(i) + velocityX.get(i));
        }
        sink ^= positionX.get(0) | 0;
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move", startN: 1_000_000 };
}

// Mirror of NumberTypedBuffer's add-sweep, but against the legacy
// ManagedTypedArrayColumn backing the legacy ECS. This isolates the
// per-column get/set cost from any ECS-level scaffolding (queryArchetypes,
// table iteration, etc.) so we can see the raw difference between the two
// column implementations on the SAME workload.
const managedArrayGetSet = (): PerformanceTest => {
    const allocator = createSimpleMemoryAllocator();
    let positionX: ReturnType<typeof createManagedArray<typeof F32.schema>>;
    let velocityX: ReturnType<typeof createManagedArray<typeof F32.schema>>;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        positionX = createManagedArray(F32.schema, allocator);
        velocityX = createManagedArray(F32.schema, allocator);
        positionX.ensureCapacity(n);
        velocityX.ensureCapacity(n);
        for (let i = 0; i < n; i++) {
            positionX.set(i, i + 1);
            velocityX.set(i, -i);
        }
    };
    const run = () => {
        for (let i = 0; i < count; i++) {
            positionX.set(i, positionX.get(i) + velocityX.get(i));
        }
        sink ^= positionX.get(0) | 0;
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move", startN: 1_000_000 };
};

const numberBufferGetSetSameWorkload = (): PerformanceTest => {
    let positionX: ReturnType<typeof createNumberBuffer>;
    let velocityX: ReturnType<typeof createNumberBuffer>;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        positionX = createNumberBuffer(F32.schema, n);
        velocityX = createNumberBuffer(F32.schema, n);
        for (let i = 0; i < n; i++) {
            positionX.set(i, i + 1);
            velocityX.set(i, -i);
        }
    };
    const run = () => {
        for (let i = 0; i < count; i++) {
            positionX.set(i, positionX.get(i) + velocityX.get(i));
        }
        sink ^= positionX.get(0) | 0;
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move", startN: 1_000_000 };
};

export const typed_buffer = {
    number_get_set: numberBufferGetSet(),
    array_get: arrayBufferGetSet(),
    struct_get: structBufferGet(),
    struct_set: structBufferSet(),
    struct_round_trip: structBufferRoundTrip(),
    // Apples-to-apples: same N, same code shape (positionX += velocityX),
    // different column implementation. Isolates legacy ManagedTypedArrayColumn
    // vs new NumberTypedBuffer for the per-element get/set cost.
    legacy_managed_array: managedArrayGetSet(),
    new_number_buffer: numberBufferGetSetSameWorkload(),
    iso_a_minimal: makeIsolatedTest((n) => new IsolatedColumnA(n)),
    iso_b_extra_fields: makeIsolatedTest((n) => new IsolatedColumnB(n)),
    iso_c_with_closure: makeIsolatedTest((n) => new IsolatedColumnC(n)),
    iso_d_typed_union: makeIsolatedTest((n) => new IsolatedColumnD(n)),
    iso_e_combined: makeIsolatedTest((n) => new IsolatedColumnE(n)),
};
