// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createSharedArrayBuffer } from "../internal/shared-array-buffer/create-shared-array-buffer.js";
import { TypedArray, TypedArrayConstructor } from "../internal/typed-array/index.js";
import { Observe } from "../observe/index.js";

// A typed-array constructor that preserves its concrete instance type, so
// `allocate(Float32Array, n)` is typed `Float32Array` (not the widened
// `TypedArray`) and can back a strongly-typed column view.
type TypedArrayConstructorOf<T extends TypedArray> = { BYTES_PER_ELEMENT: number } &
  (new (buffer?: ArrayBufferLike, byteOffset?: number, length?: number) => T);

export interface MemoryAllocator {
  /**
   * An observable event source that notifies when previously handed-out typed
   * arrays may have detached (e.g. after a `WebAssembly.Memory.grow`) and every
   * live view must be refreshed via {@link MemoryAllocator.refresh}.
   */
  needsRefresh: Observe<void>;
  /**
   * Allocate a new typed array of the specified size.
   */
  allocate<T extends TypedArray>(
    typedArray: TypedArrayConstructorOf<T>,
    sizeInElements: number
  ): T;
  /**
   * Refresh the given typed array to ensure that it is not detached.
   * If it is detached a new typed array is created and returned.
   */
  refresh<T extends TypedArray>(
    typedArray: T
  ): T;
  /**
   * Release the memory associated with the given buffer.
   */
  release(buffer: TypedArray): void;
}

const NO_REFRESH: Observe<void> = () => () => { };

/**
 * The default allocator. Each `allocate` hands out its own freshly-created
 * backing buffer (a `SharedArrayBuffer` when the runtime supports it, otherwise
 * a plain `ArrayBuffer`). Growth is realloc-and-copy at the column level, so
 * views never detach — `refresh` is the identity and `needsRefresh` never fires.
 */
export function createSimpleMemoryAllocator(): MemoryAllocator {
  return {
    needsRefresh: NO_REFRESH,
    allocate<T extends TypedArray>(
      typedArray: TypedArrayConstructorOf<T>,
      sizeInElements: number
    ): T {
      const sizeInBytes = sizeInElements * typedArray.BYTES_PER_ELEMENT;
      return new typedArray(createSharedArrayBuffer(sizeInBytes), 0, sizeInElements);
    },
    refresh<T extends TypedArray>(typedArray: T) {
      return typedArray;
    },
    release(_buffer: TypedArray): void {
      return;
    },
  };
}

/**
 * Process-wide default. The simple allocator is stateless (every `allocate`
 * mints an independent buffer; `refresh`/`release`/`needsRefresh` are no-ops),
 * so a single shared instance is safe and avoids minting one allocator per
 * buffer. Used whenever no custom allocator is injected.
 */
export const defaultMemoryAllocator: MemoryAllocator = createSimpleMemoryAllocator();

// ─────────────────────────────────────────────────────────────────────────────
// Arena allocator
//
// A single large backing buffer sub-allocated via a first-fit free list. This
// is the shape both the WebAssembly and growable-SharedArrayBuffer allocators
// share: every column becomes a fixed (offset, length) view into ONE buffer, so
// the whole arena can (in principle) be handed to another thread and numeric
// component storage read/written there without copying.
//
// The two backings differ only in what `grow` does to existing views:
//   - WebAssembly.Memory.grow() DETACHES the old ArrayBuffer, so every live
//     view must be rebuilt against the new `memory.buffer` (needsRefresh fires).
//   - A growable SharedArrayBuffer grows in place and never detaches, so live
//     views stay valid and no refresh is needed.
// ─────────────────────────────────────────────────────────────────────────────

const ALIGNMENT = 16;

const alignUp = (bytes: number): number =>
  Math.ceil(bytes / ALIGNMENT) * ALIGNMENT;

interface ArenaBacking {
  /** The current backing buffer. For wasm this changes identity after grow. */
  buffer(): ArrayBufferLike;
  /** Total capacity of the backing buffer in bytes. */
  byteLength(): number;
  /** Grow the backing buffer so its capacity is at least `minByteLength`. */
  grow(minByteLength: number): void;
  /** Whether existing views detach when `grow` is called (wasm: true). */
  readonly detachesOnGrow: boolean;
}

// What a live allocation occupies. Kept in a WeakMap keyed by the handed-out
// view so `refresh` can rebuild a DETACHED view — a detached TypedArray reports
// byteOffset/length as 0, so the offset cannot be recovered from the view alone.
interface Allocation {
  readonly offset: number;
  readonly length: number;
  readonly ctor: TypedArrayConstructor;
}

function createArenaAllocator(backing: ArenaBacking): MemoryAllocator {
  const freeList: { offset: number; size: number }[] = [
    { offset: 0, size: backing.byteLength() },
  ];
  const live = new WeakMap<TypedArray, Allocation>();
  const [needsRefresh, notifyNeedsRefresh] = Observe.createEvent<void>();

  const mergeFreeBlocks = (): void => {
    freeList.sort((a, b) => a.offset - b.offset);
    let i = 0;
    while (i < freeList.length - 1) {
      const current = freeList[i];
      const next = freeList[i + 1];
      if (current.offset + current.size === next.offset) {
        current.size += next.size;
        freeList.splice(i + 1, 1);
      } else {
        i++;
      }
    }
  };

  const growArena = (minAdditionalBytes: number): void => {
    const before = backing.byteLength();
    backing.grow(before + minAdditionalBytes);
    const after = backing.byteLength();
    if (after > before) {
      freeList.push({ offset: before, size: after - before });
      mergeFreeBlocks();
    }
    // A detaching grow invalidated every live view; tell holders to refresh.
    if (backing.detachesOnGrow) {
      notifyNeedsRefresh();
    }
  };

  const allocate = <T extends TypedArray>(
    typedArray: { BYTES_PER_ELEMENT: number } & (new (buffer?: ArrayBufferLike, byteOffset?: number, length?: number) => T),
    sizeInElements: number
  ): T => {
    const sizeInBytes = alignUp(sizeInElements * typedArray.BYTES_PER_ELEMENT);
    let index = freeList.findIndex((block) => block.size >= sizeInBytes);
    if (index === -1) {
      growArena(sizeInBytes);
      index = freeList.findIndex((block) => block.size >= sizeInBytes);
    }

    const block = freeList[index];
    freeList.splice(index, 1);
    const remainingSize = block.size - sizeInBytes;
    if (remainingSize > 0) {
      freeList.push({ offset: block.offset + sizeInBytes, size: remainingSize });
    }

    const view = new typedArray(backing.buffer(), block.offset, sizeInElements);
    // The simple allocator always hands back a freshly zeroed buffer; match that
    // so callers see default (0) storage regardless of allocator. A reused free
    // block still holds its previous occupant's bytes, so zero unconditionally.
    view.fill(0);
    live.set(view, { offset: block.offset, length: sizeInElements, ctor: typedArray });
    return view;
  };

  const refresh = <T extends TypedArray>(array: T): T => {
    const info = live.get(array);
    // Not one of ours (e.g. a default-allocated copy) — leave it untouched.
    if (info === undefined) {
      return array;
    }
    const buffer = backing.buffer();
    // Still bound to the current backing and correctly sized ⇒ nothing to do.
    if (array.buffer === buffer && array.length === info.length) {
      return array;
    }
    // Runtime invariant the compiler can't see: `info.ctor` is the exact
    // constructor `array` was allocated with, so the rebuilt view has type T.
    const view = new info.ctor(buffer, info.offset, info.length) as T;
    live.delete(array);
    live.set(view, info);
    return view;
  };

  const release = (array: TypedArray): void => {
    const info = live.get(array);
    if (info === undefined) {
      // Unknown view: fall back to its own offset/length (only valid if it has
      // not detached). Detached views report 0/0 and free nothing.
      if (array.byteLength > 0) {
        freeList.push({ offset: array.byteOffset, size: alignUp(array.byteLength) });
        mergeFreeBlocks();
      }
      return;
    }
    freeList.push({
      offset: info.offset,
      size: alignUp(info.length * info.ctor.BYTES_PER_ELEMENT),
    });
    mergeFreeBlocks();
    live.delete(array);
  };

  return { needsRefresh, allocate, refresh, release };
}

const PAGE_SIZE = 64 * 1024; // 64 KB — one WebAssembly memory page.

/**
 * Sub-allocate numeric component storage into a `WebAssembly.Memory`, so the
 * same bytes are visible to a wasm module (physics, codecs, …) without copying.
 * `memory.grow` detaches the backing buffer, so every live view is refreshed via
 * `needsRefresh` when the arena has to grow.
 */
export function createWasmMemoryAllocator(
  memory: WebAssembly.Memory
): MemoryAllocator {
  return createArenaAllocator({
    buffer: () => memory.buffer,
    byteLength: () => memory.buffer.byteLength,
    grow: (minByteLength) => {
      const current = memory.buffer.byteLength;
      if (minByteLength <= current) return;
      memory.grow(Math.ceil((minByteLength - current) / PAGE_SIZE));
    },
    detachesOnGrow: true,
  });
}

/** Whether the runtime supports a growable `SharedArrayBuffer`. */
export function isSharedArrayBufferAllocatorSupported(): boolean {
  if (typeof globalThis.SharedArrayBuffer === "undefined") {
    return false;
  }
  try {
    // `maxByteLength` + `grow` are the growable-SAB feature; older engines ship
    // SharedArrayBuffer without them.
    const probe = new SharedArrayBuffer(0, { maxByteLength: PAGE_SIZE });
    return typeof (probe as SharedArrayBuffer & { grow?: unknown }).grow === "function";
  } catch {
    return false;
  }
}

export interface SharedArrayBufferAllocatorOptions {
  /** Initial arena size in bytes. Defaults to 64 KB. */
  initialByteLength?: number;
  /** Maximum arena size in bytes (the growable SAB's cap). Defaults to 1 GB. */
  maxByteLength?: number;
}

/**
 * Sub-allocate numeric component storage into a single growable
 * `SharedArrayBuffer`, so the arena can be posted to a worker once and shared
 * without copying. A growable SAB grows in place and never detaches, so live
 * views stay valid across growth (`needsRefresh` never fires).
 *
 * @throws if the runtime lacks growable-SharedArrayBuffer support — feature-test
 * with {@link isSharedArrayBufferAllocatorSupported} and fall back to
 * {@link createSimpleMemoryAllocator} when unavailable.
 */
export function createSharedArrayBufferAllocator(
  options: SharedArrayBufferAllocatorOptions = {}
): MemoryAllocator {
  if (!isSharedArrayBufferAllocatorSupported()) {
    throw new Error(
      "Growable SharedArrayBuffer is not supported in this environment. " +
      "Feature-test with isSharedArrayBufferAllocatorSupported() and fall back " +
      "to createSimpleMemoryAllocator()."
    );
  }
  const maxByteLength = options.maxByteLength ?? 1024 * 1024 * 1024; // 1 GB
  const initialByteLength = Math.min(
    options.initialByteLength ?? PAGE_SIZE,
    maxByteLength
  );
  const sab = new SharedArrayBuffer(initialByteLength, { maxByteLength });

  return createArenaAllocator({
    buffer: () => sab,
    byteLength: () => sab.byteLength,
    grow: (minByteLength) => {
      if (minByteLength <= sab.byteLength) return;
      if (minByteLength > maxByteLength) {
        throw new Error(
          `SharedArrayBuffer allocator exhausted: requested ${minByteLength} bytes ` +
          `but maxByteLength is ${maxByteLength}. Pass a larger maxByteLength.`
        );
      }
      sab.grow(minByteLength);
    },
    detachesOnGrow: false,
  });
}
