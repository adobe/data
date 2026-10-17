import { layout, recordBytes } from '../../gpu/layout.js';
import type { Archetype, Storage } from './archetype.js';

export { recordBytes };
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
    /**
     * The word address of a block for `key` holding the first `count` elements of `array`, written when `changed` or
     * when the block moves, such as the row lists an `up` system's dispatches read.
     */
    readonly uploadIndexes: (key: string, array: Int32Array, count: number, changed: boolean) => number;
    /** Writes a record for `key` (one per system and archetype) and returns its dynamic offset. */
    readonly record: (key: string, words: Uint32Array) => number;
    readonly markCpuWrites: (archetype: Archetype, storage: Storage) => void;
    readonly markGpuWrites: (archetype: Archetype, storage: Storage) => void;
    /** Whether a storage has GPU writes the CPU hasn't seen. */
    readonly isAhead: (storage: Storage) => boolean;
    readonly anyAhead: () => boolean;
    /** Copies GPU writes back into the CPU storages; every storage when `storages` is omitted. */
    readonly readback: (storages?: readonly Storage[]) => Promise<void>;
    /** Before a sync point: notes row counts, so the rows it only appends are uploaded alone. */
    readonly beforeSync: () => void;
    /** Once a sync point is planned: the archetypes whose existing rows it moves or writes, read back first and uploaded whole. */
    readonly disturb: (disturbed: ReadonlySet<Archetype>) => void;
    /** After a sync point: the archetypes it changed, whose new rows, or all rows if disturbed, are uploaded next. */
    readonly touched: (archetypes: Iterable<Archetype>) => void;
    /** Set once the device is lost; later runs that use the GPU reject with it, and readbacks keep the CPU's copies. */
    readonly lost: () => string | null;
    /** Records the first error a run's scopes report, for the next run to reject with. */
    /** Keeps the first error of a run's GPU work, with the name of the system whose run submitted it. */
    readonly reportErrors: (name: string, validation: Promise<GPUError | null>, memory: Promise<GPUError | null>) => void;
    /** The recorded error, cleared. */
    readonly takeError: () => { readonly name: string; readonly message: string } | null;
    readonly destroy: () => void;
};

const sizeClass = (bytes: number): number => Math.max(0, Math.ceil(Math.log2(Math.max(bytes, minimumBlockBytes) / minimumBlockBytes)));

export const createGpu = (device: GPUDevice): GpuEngine => {
    const renderLayout = layout(device);
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
    let recorded: { readonly name: string; readonly message: string } | null = null;
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
            const bytes = Math.max(minimumBlockBytes, archetype.capacity * resident.stride);
            const offset = allocate(bytes);
            if (resident.bytes === 0) {
                resident.dirtyLow = 0;
                resident.dirtyHigh = archetype.count;
            }
            else {
                // The old rows move on the GPU, where they may be newer than the CPU's; a buffer can't copy into itself.
                submit();
                const used = resident.capacity * resident.stride;
                const scratch = device.createBuffer({ size: used, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
                const copy = device.createCommandEncoder();
                copy.copyBufferToBuffer(heap, resident.offset, scratch, 0, used);
                copy.copyBufferToBuffer(scratch, 0, heap, offset, used);
                device.queue.submit([copy.finish()]);
                scratch.destroy();
                (freeBlocks[sizeClass(resident.bytes)] ??= []).push(resident.offset);
            }
            resident.offset = offset;
            resident.bytes = bytes;
            resident.capacity = archetype.capacity;
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

    const indexBlocks = new Map<string, { offset: number; bytes: number }>();
    const uploadIndexes = (key: string, array: Int32Array, count: number, changed: boolean): number => {
        const bytes = Math.max(minimumBlockBytes, count * 4);
        let block = indexBlocks.get(key);
        let write = changed;
        if (block === undefined || block.bytes < bytes) {
            if (block !== undefined) (freeBlocks[sizeClass(block.bytes)] ??= []).push(block.offset);
            block = { offset: allocate(bytes), bytes: minimumBlockBytes * 2 ** sizeClass(bytes) };
            indexBlocks.set(key, block);
            write = true;
        }
        if (write && count > 0) {
            // A queue write lands before work recorded but not yet submitted, which may read the old lists.
            submit();
            device.queue.writeBuffer(heap, block.offset, array, 0, count);
        }
        return block.offset / 4;
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
        // A lost device's copies are gone, so the CPU's last copies stand.
        if (lostReason !== null) {
            ahead.clear();
            return;
        }
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

    let disturbedNow: ReadonlySet<Archetype> = new Set();
    /** Row counts of archetypes with GPU copies, before the sync point. */
    const countsBefore = new Map<Archetype, number>();
    const beforeSync = (): void => {
        disturbedNow = new Set();
        countsBefore.clear();
        for (const resident of residents.values()) countsBefore.set(resident.archetype, resident.archetype.count);
    };

    const touched = (archetypes: Iterable<Archetype>): void => {
        for (const archetype of archetypes) {
            const from = disturbedNow.has(archetype) ? 0 : countsBefore.get(archetype) ?? 0;
            for (const storage of archetype.storages) {
                const resident = residents.get(storage);
                if (resident === undefined || from >= archetype.count) continue;
                // A disturbed archetype was read back whole, so every row is the CPU's; otherwise only the new ones are.
                resident.dirtyLow = resident.dirtyHigh > resident.dirtyLow ? Math.min(resident.dirtyLow, from) : from;
                resident.dirtyHigh = Math.max(resident.dirtyHigh, archetype.count);
            }
        }
        disturbedNow = new Set();
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
        uploadIndexes,
        record,
        markCpuWrites,
        markGpuWrites,
        isAhead: storage => {
            const resident = residents.get(storage);
            return resident !== undefined && ahead.has(resident);
        },
        anyAhead: () => ahead.size > 0,
        readback,
        beforeSync,
        disturb: disturbed => { disturbedNow = disturbed; },
        touched,
        lost: () => lostReason,
        reportErrors: (name, validation, memory) => {
            void (async () => {
                const [invalid, exhausted] = await Promise.all([validation, memory]);
                if (invalid !== null) recorded ??= { name, message: `validation: ${invalid.message}` };
                else if (exhausted !== null) recorded ??= { name, message: `out of memory: ${exhausted.message}` };
            })();
        },
        takeError: () => {
            const error = recorded;
            recorded = null;
            return error;
        },
        destroy: () => {
            submit();
            heap.destroy();
            records.destroy();
        },
    };
};
