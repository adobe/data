// © 2026 Adobe. MIT License. See /LICENSE for details.
import { MemoryAllocator } from "./memory-allocator.js";
import { Schema } from "../schema/index.js";
import { TypedArray, TypedArrayConstructor } from "../internal/typed-array/index.js";
import { Data } from "../index.js";

export interface NativeArray<T> {
  readonly length: number;
  [n: number]: T;
}

/**
 * Represents an abstraction over Arrays, numeric TypedArrays and
 * TypedArrays which contain tightly packed linear memory structures.
 */
export interface ManagedArray<T> {
  get(index: number): T;
  set(index: number, value: T): void;
  readonly native?: NativeArray<T>;
  readonly constant: boolean;

  ensureCapacity(capacity: number): void;
  slice(from: number, length: number): Array<T>;
  move(from: number, to: number): void;

  toJSON(length: number, allowEncoding?: boolean): Data;
  fromJSON(data: Data, length: number): void;
}

function createManagedConstantArray<T>(value: T): ManagedArray<T> {
  return {
    constant: true,
    get(_index: number): T {
      return value;
    },
    set(_index: number, _value: T): void { },
    move(_from: number, _to: number): void { },
    slice(_from: number, _length: number): Array<T> {
      return [value];
    },
    ensureCapacity(_capacity: number) { },
    toJSON(_length: number) {
      return value as Data;
    },
    fromJSON(data: Data) {
      if (data !== value) {
        throw new Error(`Cannot set constant array to ${data}`);
      }
    },
  };
}

function createManagedBasicArray<T>(): ManagedArray<T> {
  const array: T[] = [];
  return {
    constant: false,
    native: array,
    get: (index: number) => array[index],
    set: (index: number, value: T) => (array[index] = value),
    move: (from: number, to: number) => (array[to] = array[from]),
    ensureCapacity: (_capacity: number) => { },
    slice: (from: number, length: number) => array.slice(from, from + length),
    toJSON(length: number) {
      return array.slice(0, length) as Data;
    },
    fromJSON(data: Data) {
      if (!Array.isArray(data)) {
        throw new Error(`Cannot set array to ${data}`);
      }
      array.length = 0;
      array.push(...data as T[]);
    },
  };
}

function binaryEncode(subarray: TypedArray): string {
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        subarray.buffer,
        subarray.byteOffset,
        subarray.byteLength
      )
    )
  );
}

function binaryDecode(
  data: string,
  length: number,
  ctor: TypedArrayConstructor
): TypedArray {
  const binaryString = atob(data);
  const byteArray = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    byteArray[i] = binaryString.charCodeAt(i);
  }
  return new ctor(byteArray.buffer, byteArray.byteOffset, length);
}

// Methods live on the prototype so every numeric column shares one hidden
// class. This lets V8 monomorphize the IC at hot get/set call sites in tight
// per-row loops (~20× speedup over the previous closure-per-instance shape).
class ManagedTypedArrayColumn implements ManagedArray<number> {
  readonly constant = false;
  array: TypedArray;
  private capacity: number;
  private readonly ctor: TypedArrayConstructor;
  private readonly allocator: MemoryAllocator;

  constructor(ctor: TypedArrayConstructor, allocator: MemoryAllocator) {
    this.ctor = ctor;
    this.allocator = allocator;
    this.capacity = 16;
    this.array = allocator.allocate(ctor, this.capacity);
    //  when the main wasm memory is resized, we need to refresh the array.
    allocator.needsRefresh(() => {
      this.array = allocator.refresh(this.array);
    });
  }

  get native(): TypedArray {
    return this.array;
  }

  get(index: number): number {
    return this.array[index];
  }

  set(index: number, value: number): void {
    this.array[index] = value;
  }

  move(from: number, to: number): void {
    this.array[to] = this.array[from];
  }

  slice(start: number, end: number): number[] {
    return [...this.array.subarray(start, end)];
  }

  ensureCapacity(newCapacity: number): void {
    this.grow(newCapacity);
  }

  private grow(newCapacity?: number): void {
    if (newCapacity && newCapacity > this.capacity) {
      this.array = this.allocator.refresh(this.array);
      const oldArray = this.array;
      const growthFactor = 2;
      this.capacity = Math.max(newCapacity, this.capacity * growthFactor);
      const newArray = this.allocator.allocate(this.ctor, this.capacity);
      newArray.set(this.array);
      this.array = newArray;
      this.allocator.release(oldArray);
    }
  }

  toJSON(length: number, allowEncoding = true): Data {
    const subarray = this.array.subarray(0, length);
    if (!allowEncoding) {
      return Array.from(subarray);
    }
    const jsonString = JSON.stringify(Array.from(subarray));
    const binaryString = binaryEncode(subarray);
    return binaryString.length < jsonString.length
      ? binaryString
      : Array.from(subarray);
  }

  fromJSON(data: Data, length: number): void {
    if (typeof data === "string") {
      const decodedArray = binaryDecode(data, length, this.ctor);
      if (decodedArray.length > this.capacity) {
        this.grow(decodedArray.length);
      }
      this.array.set(decodedArray);
    } else {
      if (!Array.isArray(data)) {
        throw new Error(`Cannot set array to ${data}`);
      }
      if (data.length > this.capacity) {
        this.grow(data.length);
      }
      this.array.set(data as number[]);
    }
  }
}

function createManagedTypedArray(
  ctor: TypedArrayConstructor,
  allocator: MemoryAllocator
): ManagedArray<number> {
  return new ManagedTypedArrayColumn(ctor, allocator);
}

export function createManagedArray<S extends Schema>(
  s: S,
  allocator: MemoryAllocator
): ManagedArray<Schema.ToType<S>> {
  if (s.const !== undefined) {
    return createManagedConstantArray(s.const) as ManagedArray<Schema.ToType<S>>;
  }
  if (s.type === "number") {
    if (s.precision === 1) {
      return createManagedTypedArray(Float32Array, allocator) as ManagedArray<
        Schema.ToType<S>
      >;
    }
    // default to double precision float
    return createManagedTypedArray(Float64Array, allocator) as ManagedArray<
      Schema.ToType<S>
    >;
  }
  if (
    s.type === "integer" &&
    s.minimum !== undefined
  ) {
    if (s.minimum >= 0) {
      if (s.maximum) {
        // unsigned integers
        if (s.maximum <= 0xff) {
          return createManagedTypedArray(Uint8Array, allocator) as ManagedArray<
            Schema.ToType<S>
          >;
        }
        if (s.maximum <= 0xffff) {
          return createManagedTypedArray(Uint16Array, allocator) as ManagedArray<
            Schema.ToType<S>
          >;
        }
        if (s.maximum <= 0xffffffff) {
          return createManagedTypedArray(Uint32Array, allocator) as ManagedArray<
            Schema.ToType<S>
          >;
        }
      }
    }
  }
  return createManagedBasicArray();
}
