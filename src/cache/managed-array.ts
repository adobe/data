/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
import { MemoryAllocator } from "./memory-allocator.js";
import { FromSchema, Schema } from "../core/schema/schema.js";
import { TypedArray, TypedArrayConstructor } from "../types/types.js";
import { Data } from "../core/index.js";

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

function createManagedTypedArray(
  ctor: TypedArrayConstructor,
  allocator: MemoryAllocator
): ManagedArray<number> {
  let capacity = 16;
  let array = allocator.allocate(ctor, capacity);
  //  when the main wasm memory is resized, we need to refresh the array.
  allocator.needsRefresh(() => {
    array = allocator.refresh(array);
  });

  const grow = (newCapacity?: number) => {
    if (newCapacity && newCapacity > capacity) {
      array = allocator.refresh(array);
      const oldArray = array;
      const growthFactor = 2;
      capacity = Math.max(newCapacity, capacity * growthFactor);
      const newArray = allocator.allocate(ctor, capacity);
      newArray.set(array);
      array = newArray;
      allocator.release(oldArray);
    }
  };
  const result = {
    constant: false,
    get native() {
      return array;
    },
    get(index: number) {
      return array[index];
    },
    set(index: number, value: number): void {
      // if (index >= capacity) {
      //   grow();
      // }
      array[index] = value;
    },
    move(from: number, to: number): void {
      array[to] = array[from];
    },
    slice(start: number, end: number) {
      return [...array.subarray(start, end)];
    },
    ensureCapacity(newCapacity: number) {
      grow(newCapacity);
    },
    toJSON(length: number, allowEncoding = true) {
      const subarray = array.subarray(0, length);
      if (!allowEncoding) {
        return Array.from(subarray);
      }
      const jsonString = JSON.stringify(Array.from(subarray));
      const binaryString = binaryEncode(subarray);
      return binaryString.length < jsonString.length
        ? binaryString
        : Array.from(subarray);
    },
    fromJSON(data: Data, length: number) {
      if (typeof data === "string") {
        const decodedArray = binaryDecode(data, length, ctor);
        if (decodedArray.length > capacity) {
          grow(decodedArray.length);
        }
        array.set(decodedArray);
      } else {
        if (!Array.isArray(data)) {
          throw new Error(`Cannot set array to ${data}`);
        }
        if (data.length > capacity) {
          grow(data.length);
        }
        array.set(data as number[]);
      }
    },
  };
  return result;
}

export function createManagedArray<S extends Schema>(
  s: S,
  allocator: MemoryAllocator
): ManagedArray<FromSchema<S>> {
  if (s.const !== undefined) {
    return createManagedConstantArray(s.const) as ManagedArray<FromSchema<S>>;
  }
  if (s.type === "number") {
    if (s.precision === 1) {
      return createManagedTypedArray(Float32Array, allocator) as ManagedArray<
        FromSchema<S>
      >;
    }
    // default to double precision float
    return createManagedTypedArray(Float64Array, allocator) as ManagedArray<
      FromSchema<S>
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
            FromSchema<S>
          >;
        }
        if (s.maximum <= 0xffff) {
          return createManagedTypedArray(Uint16Array, allocator) as ManagedArray<
            FromSchema<S>
          >;
        }
        if (s.maximum <= 0xffffffff) {
          return createManagedTypedArray(Uint32Array, allocator) as ManagedArray<
            FromSchema<S>
          >;
        }
      }
    }
  }
  return createManagedBasicArray();
}
