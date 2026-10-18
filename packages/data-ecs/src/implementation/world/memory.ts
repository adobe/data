/** Bytes per WebAssembly page. */
export const pageBytes = 65536;
/** 4 GiB, the wasm32 limit. Shared memory reserves address space up front, not physical memory. */
const maximumPages = 65536;
/** Smallest block; also the alignment of every block, so columns never share a cache line. */
const minimumBlockBytes = 64;

/**
 * The layout directory's header (`layout-directory.ts`): the first block, at offset 0, which never moves. Its first word is
 * the memory's length in pages, stored right after each grow, since 4 GiB in bytes doesn't fit a 32-bit word.
 */
export const headerBytes = minimumBlockBytes;
export const pagesWord = 0;

/**
 * A shared `WebAssembly.Memory` arena with power-of-two size classes.
 * Grows only when called from a sync point; views over a shared buffer stay valid as it grows.
 * Without shared memory (a page that isn't cross-origin isolated), each array gets its own `ArrayBuffer`
 * instead, since growing unshared memory would detach every view; that world runs on the main thread only.
 */
export type Memory = {
    readonly memory: WebAssembly.Memory;
    readonly shared: boolean;
    /** The layout directory's header, at offset 0; for unshared memory, an array of its own that no other thread reads. */
    readonly header: Uint32Array;
    /** Returns a 64-byte aligned offset of a block with at least `bytes`. Contents are unspecified. */
    readonly allocate: (bytes: number) => number;
    readonly free: (offset: number, bytes: number) => void;
};

const sizeClass = (bytes: number): number => Math.max(0, Math.ceil(Math.log2(Math.max(bytes, minimumBlockBytes) / minimumBlockBytes)));

/** Shared memory is available in node and in cross-origin isolated pages. */
export const sharedMemoryAvailable = (): boolean => globalThis.crossOriginIsolated !== false;

export const createMemory = (shared = sharedMemoryAvailable()): Memory => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: shared ? maximumPages : 1, shared });
    const freeBlocks: number[][] = [];
    let top = shared ? headerBytes : 0;
    const header = shared ? new Uint32Array(memory.buffer, 0, headerBytes / 4) : new Uint32Array(headerBytes / 4);
    header[pagesWord] = memory.buffer.byteLength / pageBytes;

    const allocate = (bytes: number): number => {
        const size = sizeClass(bytes);
        const reused = freeBlocks[size]?.pop();
        if (reused !== undefined) return reused;
        const offset = top;
        top += minimumBlockBytes * 2 ** size;
        const shortfall = top - memory.buffer.byteLength;
        // Grow at least by half again, so filling a world grows memory a logarithmic number of times.
        if (shortfall > 0) {
            const pages = memory.buffer.byteLength / pageBytes;
            memory.grow(Math.min(maximumPages - pages, Math.max(Math.ceil(shortfall / pageBytes), Math.ceil(pages / 2))));
            // Other threads check their buffer covers it at each task's start.
            Atomics.store(header, pagesWord, memory.buffer.byteLength / pageBytes);
        }
        return offset;
    };

    const free = (offset: number, bytes: number): void => {
        (freeBlocks[sizeClass(bytes)] ??= []).push(offset);
    };

    return { memory, shared, header, allocate, free };
};
