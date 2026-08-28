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
  /**
   * Grow the backing buffer to at least `minByteLength`, preferring
   * `preferredByteLength` when the backing can accommodate it (geometric growth).
   * @throws an actionable error when even `minByteLength` cannot be satisfied.
   */
  grow(minByteLength: number, preferredByteLength: number): void;
  /** Whether existing views detach when `grow` is called (wasm: true). */
  readonly detachesOnGrow: boolean;
  /**
   * Bytes at the START of the backing buffer that the arena does NOT own (e.g. a
   * wasm module's own data/stack). Allocations never touch below this offset.
   * Aligned to {@link ALIGNMENT}.
   */
  readonly baseOffset: number;
}

// What a live allocation occupies. Kept in a WeakMap keyed by the handed-out
// view so `refresh` can rebuild a DETACHED view — a detached TypedArray reports
// byteOffset/length as 0, so the offset cannot be recovered from the view alone.
interface Allocation {
  readonly offset: number;
  readonly length: number;
  readonly ctor: TypedArrayConstructor;
}

// `zeroed` tracks whether a free block's bytes are known to be all-zero (fresh
// from a spec-zeroed grow, or never written). Allocating a zeroed block can skip
// the fill(0); a released (dirty) block cannot.
interface FreeBlock {
  offset: number;
  size: number;
  zeroed: boolean;
}

function createArenaAllocator(backing: ArenaBacking): MemoryAllocator {
  const freeList: FreeBlock[] = [
    { offset: backing.baseOffset, size: backing.byteLength() - backing.baseOffset, zeroed: true },
  ];
  const live = new WeakMap<TypedArray, Allocation>();
  const [needsRefresh, notifyNeedsRefresh] = Observe.createEvent<void>();

  // Insert a freed/grown block keeping `freeList` sorted by offset and merging
  // with the immediately adjacent neighbors only — no full re-sort. A merge of a
  // zeroed and a dirty block yields dirty (the union contains non-zero bytes).
  const insertFreeBlock = (offset: number, size: number, zeroed: boolean): void => {
    let i = 0;
    while (i < freeList.length && freeList[i].offset < offset) i++;
    freeList.splice(i, 0, { offset, size, zeroed });
    // Merge current into its right neighbor.
    const next = freeList[i + 1];
    if (next && offset + size === next.offset) {
      freeList[i].size += next.size;
      freeList[i].zeroed = freeList[i].zeroed && next.zeroed;
      freeList.splice(i + 1, 1);
    }
    // Merge current into its left neighbor.
    if (i > 0) {
      const prev = freeList[i - 1];
      const cur = freeList[i];
      if (prev.offset + prev.size === cur.offset) {
        prev.size += cur.size;
        prev.zeroed = prev.zeroed && cur.zeroed;
        freeList.splice(i, 1);
      }
    }
  };

  const growArena = (minAdditionalBytes: number): void => {
    const before = backing.byteLength();
    const usable = before - backing.baseOffset;
    // Geometric: prefer at least doubling the usable arena so a run of small
    // allocations does not trigger a grow (and, for wasm, a detach storm) each.
    backing.grow(before + minAdditionalBytes, before + Math.max(minAdditionalBytes, usable));
    const after = backing.byteLength();
    if (after > before) {
      // Freshly grown backing memory is spec-zeroed.
      insertFreeBlock(before, after - before, true);
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
    // A zero-length request carves nothing and is not tracked — hand out an empty
    // view at the arena base (aligned, touches no owned bytes).
    if (sizeInBytes === 0) {
      return new typedArray(backing.buffer(), backing.baseOffset, 0);
    }
    let index = freeList.findIndex((block) => block.size >= sizeInBytes);
    if (index === -1) {
      growArena(sizeInBytes);
      index = freeList.findIndex((block) => block.size >= sizeInBytes);
    }

    const block = freeList[index];
    freeList.splice(index, 1);
    const remainingSize = block.size - sizeInBytes;
    if (remainingSize > 0) {
      insertFreeBlock(block.offset + sizeInBytes, remainingSize, block.zeroed);
    }

    const view = new typedArray(backing.buffer(), block.offset, sizeInElements);
    // The simple allocator always hands back a freshly zeroed buffer; match that
    // so callers see default (0) storage regardless of allocator. A block that is
    // already known-zero (fresh from grow / never written) skips the redundant
    // fill; a reused dirty block still holds stale bytes and must be zeroed.
    if (!block.zeroed) {
      view.fill(0);
    }
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
    // Only views this arena handed out can be released. A foreign view's
    // byteOffset is relative to a DIFFERENT buffer, so trusting it would insert a
    // bogus (overlapping) block into this free list — silently ignore it.
    if (info === undefined) {
      return;
    }
    insertFreeBlock(info.offset, alignUp(info.length * info.ctor.BYTES_PER_ELEMENT), false);
    live.delete(array);
  };

  return { needsRefresh, allocate, refresh, release };
}

const PAGE_SIZE = 64 * 1024; // 64 KB — one WebAssembly memory page.

export interface WasmMemoryAllocatorOptions {
  /**
   * Bytes at the start of `memory` reserved for the wasm module itself (its data
   * segment / stack / heap). The arena allocates only ABOVE this offset and never
   * zeroes or hands out the reserved region. Defaults to 0 (the allocator owns
   * the whole memory). Rounded up to a 16-byte boundary.
   */
  byteOffset?: number;
}

/**
 * Sub-allocate numeric component storage into a `WebAssembly.Memory`, so the
 * same bytes are visible to a wasm module (physics, codecs, …) without copying.
 * `memory.grow` swaps in a new backing buffer, so every live view is refreshed
 * via `needsRefresh` when the arena has to grow.
 *
 * The arena owns `[byteOffset, end)` of the memory; pass `byteOffset` when the
 * same `Memory` also backs a module whose own state lives in the low addresses.
 *
 * **Shared memory = wasm-accessible AND cross-worker shareable.** Construct the
 * memory with `{ shared: true }` (which requires `maximum`) and `memory.buffer`
 * is a growable `SharedArrayBuffer`. This allocator then gives you the union of
 * both off-the-shelf arenas in one — numeric components that a wasm module can
 * read/write in place *and* that can be posted to a worker without copying:
 *
 * ```ts
 * const memory = new WebAssembly.Memory({ initial: 16, maximum: 4096, shared: true });
 * createDatabase(plugin, { allocator: createWasmMemoryAllocator(memory) });
 * ```
 *
 * Unlike non-shared memory (whose old buffer is DETACHED on grow), a shared
 * memory's prior buffer stays valid and aliases the same pages; V8 still returns
 * a fresh `SharedArrayBuffer` object from `memory.buffer` after a grow, so views
 * are refreshed onto it and every column stays on one shared buffer. In a
 * browser, `SharedArrayBuffer` requires cross-origin isolation (COOP/COEP).
 */
export function createWasmMemoryAllocator(
  memory: WebAssembly.Memory,
  options: WasmMemoryAllocatorOptions = {}
): MemoryAllocator {
  const growTo = (targetBytes: number): boolean => {
    const current = memory.buffer.byteLength;
    if (targetBytes <= current) return true;
    try {
      memory.grow(Math.ceil((targetBytes - current) / PAGE_SIZE));
      return true;
    } catch {
      return false;
    }
  };
  return createArenaAllocator({
    baseOffset: alignUp(options.byteOffset ?? 0),
    buffer: () => memory.buffer,
    byteLength: () => memory.buffer.byteLength,
    grow: (minByteLength, preferredByteLength) => {
      // Try the geometric target first; fall back to the strict minimum so a
      // preferred overshoot past the Memory's maximum does not needlessly fail.
      if (growTo(preferredByteLength)) return;
      if (growTo(minByteLength)) return;
      throw new Error(
        `WebAssembly memory allocator exhausted: cannot grow to ${minByteLength} bytes ` +
        `(the WebAssembly.Memory maximum has been reached).`
      );
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
  // Align both bounds to 16 so every (offset, length) sub-view the arena hands
  // out — including the first block that starts at a grown boundary — satisfies
  // the alignment every typed-array constructor requires.
  const maxByteLength = alignUp(options.maxByteLength ?? 1024 * 1024 * 1024); // 1 GB
  const initialByteLength = Math.min(
    alignUp(options.initialByteLength ?? PAGE_SIZE),
    maxByteLength
  );
  const sab = new SharedArrayBuffer(initialByteLength, { maxByteLength });

  return createArenaAllocator({
    baseOffset: 0,
    buffer: () => sab,
    byteLength: () => sab.byteLength,
    grow: (minByteLength, preferredByteLength) => {
      if (minByteLength <= sab.byteLength) return;
      if (minByteLength > maxByteLength) {
        throw new Error(
          `SharedArrayBuffer allocator exhausted: requested ${minByteLength} bytes ` +
          `but maxByteLength is ${maxByteLength}. Pass a larger maxByteLength.`
        );
      }
      // Grow to the geometric target when it fits under the cap, else to the cap.
      sab.grow(Math.min(Math.max(preferredByteLength, minByteLength), maxByteLength));
    },
    detachesOnGrow: false,
  });
}
