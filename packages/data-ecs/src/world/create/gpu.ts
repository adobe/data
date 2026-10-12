import type { Archetype, Storage } from './archetype.js';

/**
 * Bytes per parameter or table record, the dynamic offset alignment WebGPU guarantees. A record is `u32` words: a
 * row count, then a word address in the heap per column, then, for kernels, scalars as f32 bits.
 */
export const recordBytes = 256;
export const recordWords = recordBytes / 4;

/** Smallest heap block, and the alignment of every block. */
const minimumBlockBytes = 256;
const initialHeapBytes = 1 << 20;

/**
 * The GPU copy of one storage: a block of the heap holding `capacity` rows at the storage's stride. `cpuDirty` rows
 * changed on the CPU since they were last uploaded; `gpuAhead` rows were written on the GPU since they were last
 * read back. Each is a row range, empty when `low >= high`.
 */
type Resident = {
    readonly storage: Storage;
    readonly archetype: Archetype;
    readonly stride: number;
    offset: number;
    bytes: number;
    capacity: number;
    dirtyLow: number;
    dirtyHigh: number;
    aheadLow: number;
    aheadHigh: number;
};

/**
 * A world's GPU state: a heap buffer holding the GPU copies of the storages GPU systems use, one buffer of 256-byte
 * records, and the run's command encoder. Nothing here is exposed: render bodies get bind calls, not buffers, so
 * both buffers can be replaced as they grow.
 */
export type GpuEngine = {
    readonly device: GPUDevice;
    /** Heap (read-only storage) at binding 0, a table record (uniform, dynamic offset) at binding 1. */
    readonly renderLayout: GPUBindGroupLayout;
    /** Heap (read-write storage) at binding 0, a parameter record (read-only storage, dynamic offset) at binding 1. */
    readonly computeLayout: GPUBindGroupLayout;
    readonly renderGroup: () => GPUBindGroup;
    readonly computeGroup: () => GPUBindGroup;
    /** The run's encoder, created on first use. */
    readonly encoder: () => GPUCommandEncoder;
    readonly submit: () => void;
    /** Drops the run's encoder unsubmitted, after a body failed partway through recording. */
    readonly discard: () => void;
    /** The word address of a storage's GPU copy, uploading rows the CPU changed first. */
    readonly upload: (archetype: Archetype, storage: Storage) => number;
    /** Writes a record for `key` (one per system and archetype) and returns its dynamic offset. */
    readonly record: (key: string, words: Uint32Array) => number;
    readonly markCpuWrites: (archetype: Archetype, storage: Storage) => void;
    readonly markGpuWrites: (archetype: Archetype, storage: Storage) => void;
    /** Whether a storage has GPU writes the CPU hasn't seen. */
    readonly isAhead: (storage: Storage) => boolean;
    readonly anyAhead: () => boolean;
    /** Copies GPU writes back into the CPU storages; every storage when `storages` is omitted. */
    readonly readback: (storages?: readonly Storage[]) => Promise<void>;
    /** After a sync point: rows of these archetypes may have moved or changed on the CPU. */
    readonly touched: (archetypes: Iterable<Archetype>) => void;
    /** Set once the device is lost; later runs reject with it. */
    readonly lost: () => string | null;
    readonly destroy: () => void;
};

const sizeClass = (bytes: number): number => Math.max(0, Math.ceil(Math.log2(Math.max(bytes, minimumBlockBytes) / minimumBlockBytes)));

export const createGpu = (device: GPUDevice): GpuEngine => {
    const shared = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;
    const renderLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: shared, buffer: { type: "read-only-storage" } },
            { binding: 1, visibility: shared, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: recordBytes } },
        ],
    });
    const computeLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage", hasDynamicOffset: true, minBindingSize: recordBytes } },
        ],
    });
    const heapUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const recordUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    let heap = device.createBuffer({ size: initialHeapBytes, usage: heapUsage });
    let top = 0;
    const freeBlocks: number[][] = [];
    let records = device.createBuffer({ size: 64 * recordBytes, usage: recordUsage });
    const slots = new Map<string, number>();
    let groups: { render: GPUBindGroup; compute: GPUBindGroup } | null = null;
    let encoder: GPUCommandEncoder | null = null;
    let lostReason: string | null = null;
    const residents = new Map<Storage, Resident>();
    const ahead = new Set<Resident>();
    void device.lost.then(info => { lostReason = info.message === "" ? info.reason : info.message; });

    const bindGroups = (): { render: GPUBindGroup; compute: GPUBindGroup } => groups ??= {
        render: device.createBindGroup({ layout: renderLayout, entries: [{ binding: 0, resource: { buffer: heap } }, { binding: 1, resource: { buffer: records, size: recordBytes } }] }),
        compute: device.createBindGroup({ layout: computeLayout, entries: [{ binding: 0, resource: { buffer: heap } }, { binding: 1, resource: { buffer: records, size: recordBytes } }] }),
    };

    const submit = (): void => {
        if (encoder === null) return;
        device.queue.submit([encoder.finish()]);
        encoder = null;
    };

    const limit = Math.min(device.limits.maxBufferSize, device.limits.maxStorageBufferBindingSize);

    /** Replaces a buffer with one of `size` bytes holding its first `used` bytes. Work recorded so far is submitted first. */
    const replace = (old: GPUBuffer, size: number, usage: number, used: number): GPUBuffer => {
        submit();
        const grown = device.createBuffer({ size, usage });
        if (used > 0) {
            const copy = device.createCommandEncoder();
            copy.copyBufferToBuffer(old, 0, grown, 0, used);
            device.queue.submit([copy.finish()]);
        }
        old.destroy();
        groups = null;
        return grown;
    };

    const allocate = (bytes: number): number => {
        const size = sizeClass(bytes);
        const reused = freeBlocks[size]?.pop();
        if (reused !== undefined) return reused;
        const offset = top;
        const end = top + minimumBlockBytes * 2 ** size;
        if (end > heap.size) {
            if (end > limit) throw new Error(`The GPU copy of the world needs ${end} bytes, over this device's limit of ${limit}; request a higher maxBufferSize and maxStorageBufferBindingSize.`);
            let next = heap.size;
            while (next < end) next *= 2;
            heap = replace(heap, Math.min(next, limit), heapUsage, offset);
        }
        top = end;
        return offset;
    };

    const residentOf = (archetype: Archetype, storage: Storage): Resident => {
        let resident = residents.get(storage);
        if (resident === undefined) {
            const stride = storage.layout.kind === "linear" ? storage.layout.stride : 0;
            resident = { storage, archetype, stride, offset: 0, bytes: 0, capacity: 0, dirtyLow: 0, dirtyHigh: 0, aheadLow: 0, aheadHigh: 0 };
            residents.set(storage, resident);
        }
        if (resident.capacity < archetype.capacity) {
            // Archetypes grow only at sync points that apply something, and those read GPU writes back first.
            if (ahead.has(resident)) throw new Error("A storage grew while the GPU held writes the CPU hadn't seen.");
            if (resident.bytes > 0) (freeBlocks[sizeClass(resident.bytes)] ??= []).push(resident.offset);
            resident.bytes = Math.max(minimumBlockBytes, archetype.capacity * resident.stride);
            resident.offset = allocate(resident.bytes);
            resident.capacity = archetype.capacity;
            resident.dirtyLow = 0;
            resident.dirtyHigh = archetype.count;
        }
        return resident;
    };

    const upload = (archetype: Archetype, storage: Storage): number => {
        const resident = residentOf(archetype, storage);
        const high = Math.min(resident.dirtyHigh, archetype.count);
        if (resident.dirtyLow < high) {
            // A queue write lands before work recorded but not yet submitted, which may read these rows.
            submit();
            const start = resident.dirtyLow * resident.stride;
            device.queue.writeBuffer(heap, resident.offset + start, storage.views.u8, start, (high - resident.dirtyLow) * resident.stride);
        }
        resident.dirtyLow = resident.dirtyHigh = 0;
        return resident.offset / 4;
    };

    const scratch = new Uint32Array(recordWords);
    const record = (key: string, words: Uint32Array): number => {
        let slot = slots.get(key);
        if (slot === undefined) {
            slot = slots.size;
            // Records written earlier in this run may not be bound yet, so they move with the buffer.
            if ((slot + 1) * recordBytes > records.size) records = replace(records, records.size * 2, recordUsage, slot * recordBytes);
            slots.set(key, slot);
        }
        scratch.fill(0);
        scratch.set(words.subarray(0, recordWords));
        device.queue.writeBuffer(records, slot * recordBytes, scratch);
        return slot * recordBytes;
    };

    const markCpuWrites = (archetype: Archetype, storage: Storage): void => {
        const resident = residents.get(storage);
        if (resident === undefined) return;
        resident.dirtyLow = 0;
        resident.dirtyHigh = Math.max(resident.dirtyHigh, archetype.count);
    };

    const markGpuWrites = (archetype: Archetype, storage: Storage): void => {
        const resident = residents.get(storage);
        if (resident === undefined) return;
        resident.aheadLow = 0;
        resident.aheadHigh = Math.max(resident.aheadHigh, archetype.count);
        ahead.add(resident);
    };

    const readback = async (storages?: readonly Storage[]): Promise<void> => {
        const pending = storages === undefined ? [...ahead] : storages.flatMap(storage => {
            const resident = residents.get(storage);
            return resident !== undefined && ahead.has(resident) ? [resident] : [];
        });
        if (pending.length === 0) return;
        submit();
        const copy = device.createCommandEncoder();
        const staged = pending.map(resident => {
            const start = resident.aheadLow * resident.stride;
            const bytes = (resident.aheadHigh - resident.aheadLow) * resident.stride;
            const staging = device.createBuffer({ size: Math.max(4, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
            if (bytes > 0) copy.copyBufferToBuffer(heap, resident.offset + start, staging, 0, bytes);
            return { resident, staging, start, bytes };
        });
        device.queue.submit([copy.finish()]);
        await Promise.all(staged.map(({ staging }) => staging.mapAsync(GPUMapMode.READ)));
        for (const { resident, staging, start, bytes } of staged) {
            if (bytes > 0) resident.storage.views.u8.set(new Uint8Array(staging.getMappedRange(0, bytes)), start);
            staging.destroy();
            resident.aheadLow = resident.aheadHigh = 0;
            ahead.delete(resident);
        }
    };

    const touched = (archetypes: Iterable<Archetype>): void => {
        for (const archetype of archetypes) for (const storage of archetype.storages) markCpuWrites(archetype, storage);
    };

    return {
        device,
        renderLayout,
        computeLayout,
        renderGroup: () => bindGroups().render,
        computeGroup: () => bindGroups().compute,
        encoder: () => encoder ??= device.createCommandEncoder(),
        submit,
        discard: () => { encoder = null; },
        upload,
        record,
        markCpuWrites,
        markGpuWrites,
        isAhead: storage => {
            const resident = residents.get(storage);
            return resident !== undefined && ahead.has(resident);
        },
        anyAhead: () => ahead.size > 0,
        readback,
        touched,
        lost: () => lostReason,
        destroy: () => {
            submit();
            heap.destroy();
            records.destroy();
        },
    };
};
