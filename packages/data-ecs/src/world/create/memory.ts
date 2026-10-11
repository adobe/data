/** Bytes per WebAssembly page. */
const pageBytes = 65536;
/** 4 GiB, the wasm32 limit. Shared memory reserves address space up front, not physical memory. */
const maximumPages = 65536;
/** Smallest block; also the alignment of every block, so columns never share a cache line. */
const minimumBlockBytes = 64;

/**
 * A shared `WebAssembly.Memory` arena with power-of-two size classes.
 * Grows only when called from a sync point; views over a shared buffer stay valid as it grows.
 */
export type Memory = {
    readonly memory: WebAssembly.Memory;
    /** Returns a 64-byte aligned offset of a block with at least `bytes`. Contents are unspecified. */
    readonly allocate: (bytes: number) => number;
    readonly free: (offset: number, bytes: number) => void;
};

const sizeClass = (bytes: number): number => Math.max(0, Math.ceil(Math.log2(Math.max(bytes, minimumBlockBytes) / minimumBlockBytes)));

export const createMemory = (): Memory => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: maximumPages, shared: true });
    const freeBlocks: number[][] = [];
    let top = 0;

    const allocate = (bytes: number): number => {
        const size = sizeClass(bytes);
        const reused = freeBlocks[size]?.pop();
        if (reused !== undefined) return reused;
        const offset = top;
        top += minimumBlockBytes * 2 ** size;
        const shortfall = top - memory.buffer.byteLength;
        if (shortfall > 0) memory.grow(Math.ceil(shortfall / pageBytes));
        return offset;
    };

    const free = (offset: number, bytes: number): void => {
        (freeBlocks[sizeClass(bytes)] ??= []).push(offset);
    };

    return { memory, allocate, free };
};
