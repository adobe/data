// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createSharedArrayBuffer } from "../internal/shared-array-buffer/create-shared-array-buffer.js";
import { TypedArray, TypedArrayConstructor } from "../internal/typed-array/index.js";
import { Observe } from "../observe/index.js";

export interface MemoryAllocator {
  /**
   * An observable event source that notifies when the memory needs to be refreshed.
   */
  needsRefresh: Observe<void>;
  /**
   * Allocate a new typed array of the specified size.
   */
  allocate<T extends TypedArrayConstructor>(
    typedArray: T,
    sizeInElements: number
  ): InstanceType<T>;
  /**
   * Refresh the given typed array to ensure that it is not detached.
   * If it is detached a new typed array is created and returned.
   */
  refresh<T extends TypedArrayConstructor>(
    typedArray: InstanceType<T>
  ): InstanceType<T>;
  /**
   * Release the memory associated with the given buffer.
   */
  release(buffer: TypedArray): void;
}

export function createSimpleMemoryAllocator(): MemoryAllocator {
  return {
    needsRefresh: () => () => { },
    allocate<T extends TypedArrayConstructor>(
      typedArray: T,
      sizeInElements: number
    ): InstanceType<T> {
      const sizeInBytes = sizeInElements * typedArray.BYTES_PER_ELEMENT;
      return new typedArray(
        createSharedArrayBuffer(sizeInBytes),
        0,
        sizeInElements
      ) as InstanceType<T>;
    },
    refresh<T extends TypedArrayConstructor>(typedArray: InstanceType<T>) {
      return typedArray;
    },
    release(_buffer: TypedArray): void {
      return;
    },
  };
}

const PAGE_SIZE = 64 * 1024; // 64 KB

export function createWasmMemoryAllocator(
  memory: WebAssembly.Memory
): MemoryAllocator {
  const freeList = [{ offset: 0, size: memory.buffer.byteLength }];

  const [needsRefresh, notifyNeedsRefresh] = Observe.createEvent<void>();

  const mergeFreeBlocks = (): void => {
    // Sort the free list by offset
    freeList.sort((a, b) => a.offset - b.offset);

    let i = 0;
    while (i < freeList.length - 1) {
      const current = freeList[i];
      const next = freeList[i + 1];
      // Check if current block is adjacent to the next
      if (current.offset + current.size === next.offset) {
        // Merge the blocks
        current.size += next.size;
        // Remove the next block
        freeList.splice(i + 1, 1);
      } else {
        i++;
      }
    }
  };

  const growMemory = (sizeInBytes: number): number => {
    const currentSize = memory.buffer.byteLength;
    const neededPages = Math.ceil(sizeInBytes / PAGE_SIZE); // Each WebAssembly page is 65536 bytes
    memory.grow(neededPages);
    freeList.push({
      offset: currentSize,
      size: memory.buffer.byteLength - currentSize,
    });
    mergeFreeBlocks();
    notifyNeedsRefresh();
    return freeList.length - 1;
  };

  const allocate = <T extends TypedArrayConstructor>(
    typedArray: TypedArrayConstructor,
    sizeInElements: number
  ): InstanceType<T> => {
    const ALIGNMENT = 16;
    const sizeInBytes =
      Math.ceil((sizeInElements * typedArray.BYTES_PER_ELEMENT) / ALIGNMENT) *
      ALIGNMENT;
    let index = freeList.findIndex((block) => block.size >= sizeInBytes);
    if (index === -1) {
      index = growMemory(sizeInBytes);
    }

    const block = freeList[index];
    freeList.splice(index, 1); // Remove the block from the free list
    const remainingSize = block.size - sizeInBytes;
    if (remainingSize > 0) {
      freeList.push({
        offset: block.offset + sizeInBytes,
        size: remainingSize,
      });
    }

    return new typedArray(
      memory.buffer,
      block.offset,
      sizeInElements
    ) as InstanceType<T>;
  };

  const refresh = <T extends TypedArrayConstructor>(
    array: InstanceType<T>
  ): InstanceType<T> => {
    if (memory.buffer.byteLength !== array.byteLength) {
      return new (array.constructor as any)(
        memory.buffer,
        array.byteOffset,
        array.length
      );
    }
    return array;
  };

  const release = (memory: TypedArray): void => {
    if (memory.byteOffset !== undefined) {
      const newFreeBlock = {
        offset: memory.byteOffset,
        size: memory.byteLength,
      };
      freeList.push(newFreeBlock);
      mergeFreeBlocks();
    }
  };

  return {
    needsRefresh,
    allocate,
    refresh,
    release,
  };
}
