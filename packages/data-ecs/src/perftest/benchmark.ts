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
