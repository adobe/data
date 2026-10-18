/** A benchmark and what it stands for, so its results read without its code. */
export type Benchmark = {
    /** Stable across runs: results are tracked by it. */
    readonly name: string;
    /** What it measures, and what systems or rules cause it in an app. */
    readonly operation: string;
    /** What its time is divided by, such as "matched rows" or "spawns". */
    readonly per: string;
    /** How many of `per` it runs with. */
    readonly n: number;
    /** The range of `per` this operation usually sees in apps. */
    readonly typical: readonly [number, number];
    /** The best time it could take. */
    readonly best: Best;
    /** Milliseconds. */
    readonly run: () => Promise<number>;
};

/**
 * The fewest bytes per N an ideal implementation must move, in this ECS's storage model, and why. Its time is those
 * bytes at the fastest copy bandwidth the environment measured: of one thread, of every worker, or of the GPU.
 */
export type Best = { readonly bytes: number; readonly basis: string; readonly on?: "threads" | "gpu" };

/** Copy bandwidths by working set: bytes read and written per copy, and bytes per nanosecond. */
export type Curve = readonly (readonly [number, number])[];

/** Bandwidths an environment measured. */
export type Bandwidth = { readonly thread: Curve; readonly threads?: Curve; readonly gpu?: number };

/** Bytes per array of each calibration copy: from within the caches to well past them. */
export const calibrationSizes: readonly number[] = [1 << 18, 1 << 20, 1 << 22, 1 << 24, 1 << 26];

/** A line `scripts/perf.mjs` reads from a run's output. */
export const resultLine = (benchmark: Benchmark, milliseconds: number): string => {
    const { run: _, ...description } = benchmark;
    return `perf-result ${JSON.stringify({ ...description, milliseconds })}`;
};

export const environmentLine = (environment: string, bandwidth: Bandwidth): string =>
    `perf-environment ${JSON.stringify({ environment, bandwidth })}`;

/** One thread's copy bandwidth at each calibration size, from the fastest of repeated timed batches of copies. */
export const copyBandwidth = (): Curve => calibrationSizes.map(size => {
    const length = size / 8;
    const from = new Float64Array(length).fill(1);
    const to = new Float64Array(length);
    const copies = Math.max(1, Math.round((1 << 26) / size));
    let best = Infinity;
    for (let i = 0; i < 12; i++) {
        const start = performance.now();
        for (let k = 0; k < copies; k++) to.set(from);
        best = Math.min(best, (performance.now() - start) / copies);
    }
    return [2 * size, (2 * size) / (best * 1e6)];
});

/** A calibration worker: `ask` posts a message and resolves with the worker's reply. */
export type CalibrationWorker = { readonly ask: (message: unknown) => Promise<unknown>; readonly terminate: () => void };

/**
 * The script each calibration worker runs, over its scope's `onmessage` and `postMessage`. Every claim copies one piece
 * of `size / pieces` bytes `copies` times, so a pass copies `size` bytes `copies` times. A worker's buffers hold its
 * share of `size`, at least one piece, and it copies its pieces in turn.
 */
export const calibrationSource = `onmessage = ({ data: [piece, share, counter, total, copies] }) => {
    const length = piece / 8, count = Math.max(1, Math.round(share / piece));
    const source = new Float64Array(length * count).fill(1), target = new Float64Array(length * count), claims = new Int32Array(counter);
    let next = 0;
    postMessage(0);
    onmessage = () => {
        for (let claim = Atomics.add(claims, 0, 1); claim < total; claim = Atomics.add(claims, 0, 1)) {
            const start = next * length, from = source.subarray(start, start + length);
            for (let k = 0; k < copies; k++) target.set(from, start);
            next = (next + 1) % count;
        }
        postMessage(0);
    };
};`;

/**
 * Every worker's copy bandwidth together at each calibration size, each of `threads` workers copying its share in
 * buffers of its own, since copies between shared buffers are slower than the kernels' loads and stores. Workers
 * claim pieces from a shared counter, as the ECS splits work, so the slowest core doesn't set the time.
 */
export const threadsBandwidth = async (threads: number, start: () => CalibrationWorker): Promise<Curve> => {
    const pieces = 64;
    const curve: [number, number][] = [];
    for (const size of calibrationSizes) {
        const workers = Array.from({ length: threads }, start);
        const counter = new Int32Array(new SharedArrayBuffer(4));
        const copies = Math.max(1, Math.round((1 << 28) / size));
        const each = (message: unknown): Promise<unknown> => Promise.all(workers.map(worker => worker.ask(message)));
        await each([size / pieces, size / threads, counter.buffer, pieces, copies]);
        let best = Infinity;
        for (let i = 0; i < 8; i++) {
            counter[0] = 0;
            const begin = performance.now();
            await each(0);
            best = Math.min(best, (performance.now() - begin) / copies);
        }
        for (const worker of workers) worker.terminate();
        curve.push([2 * size, (2 * size) / (best * 1e6)]);
    }
    return curve;
};
