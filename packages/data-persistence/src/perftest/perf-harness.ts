// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Minimal async-aware performance harness for the persistence layer.
 *
 * Differs from `packages/data/src/perftest/perf-test.ts` in two ways:
 *
 *   1. `run` is `async` because every persistence operation drains
 *      through a transport whose acks resolve on a microtask. A
 *      sync-only harness would either record zero (work hasn't
 *      finished) or include only the synchronous `send()` push,
 *      which would be misleading.
 *
 *   2. There's a `setupBatch` hook called once per measurement loop
 *      iteration. Some scenarios (e.g. "steady delete") consume an
 *      entity per iteration; this lets the scenario refill its
 *      working set without that cost being attributed to `run()`.
 *
 * The harness is intentionally tiny — it owns warmup, auto-tuning,
 * the measurement window, and printing. Scenarios own everything
 * else (database, transport, backend, scoring).
 */

export interface PerfScenario {
    /**
     * Friendly name shown in the results table.
     */
    readonly name: string;
    /**
     * One-time setup (database creation, populating N entities, etc).
     * Called once per `n` choice during auto-tune; the measurement
     * window itself reuses the resulting state.
     */
    setup(n: number): Promise<void>;
    /**
     * Optional per-iteration setup. Returns a cost-free reference
     * (entity ids, indices, etc) that `run()` can use without
     * computing it during measurement. Called once per `run()` call.
     */
    setupBatch?(): Promise<unknown>;
    /**
     * The measured operation. Must perform exactly ONE logical
     * persistence operation (one transaction, one checkpoint, one
     * load — whatever the scenario says it measures). Returns when
     * the operation has fully drained on the persistence side.
     */
    run(batch: unknown): Promise<void>;
    /**
     * Tear down the database, dispose the service, close the
     * transport. Called once per scenario.
     */
    cleanup(): Promise<void>;
    /**
     * Auto-tune seed. Scenarios with high per-op cost should set
     * this lower than the default (1000) so the first probe doesn't
     * waste the budget.
     */
    readonly startN?: number;
}

export interface PerfResult {
    readonly name: string;
    readonly n: number;
    readonly samples: number;
    readonly meanUs: number;
    readonly minUs: number;
    readonly p50Us: number;
    readonly p99Us: number;
    readonly opsPerSec: number;
}

const DEFAULT_START_N = 1000;
// Target per-iteration time: 0.5–150 ms. Below 0.5 ms timing
// resolution dominates; above 150 ms we get too few samples in the
// 1-second budget for stable percentiles. The wide upper bound is
// deliberate — scenarios whose cold probe drifts to ~70 ms because
// of GC noise should NOT trigger auto-tune to halve N, because the
// halved version is then evaluated under DIFFERENT per-tx overhead
// proportions and produces non-comparable numbers across runs.
const TARGET_MIN_MS = 0.5;
const TARGET_MAX_MS = 150;
const MIN_AUTO_N = 1;
const MAX_AUTO_N = 100_000;
const WARMUP_MS = 100;
const MEASURE_BUDGET_MS = 1000;

const now = (): number => performance.now();

const percentile = (sortedAsc: readonly number[], p: number): number => {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
    return sortedAsc[idx]!;
};

/**
 * Auto-tune `n` so a single `run()` lands in TARGET_MIN_MS..TARGET_MAX_MS.
 * Returns the chosen n and (re-)leaves the scenario set up at that n.
 */
const tuneN = async (scenario: PerfScenario): Promise<number> => {
    let n = scenario.startN ?? DEFAULT_START_N;
    for (let attempt = 0; attempt < 4; attempt++) {
        await scenario.cleanup().catch(() => undefined);
        await scenario.setup(n);
        const batch = scenario.setupBatch ? await scenario.setupBatch() : undefined;
        const start = now();
        await scenario.run(batch);
        const elapsed = Math.max(now() - start, 0.001);
        if (elapsed >= TARGET_MIN_MS && elapsed <= TARGET_MAX_MS) return n;
        const target = (TARGET_MIN_MS + TARGET_MAX_MS) / 2;
        const ratio = target / elapsed;
        const next = Math.max(MIN_AUTO_N, Math.min(MAX_AUTO_N, Math.round(n * ratio)));
        if (next === n) return n;
        n = next;
    }
    return n;
};

/**
 * Run a single scenario through the warmup + measurement pipeline.
 */
export const runScenario = async (scenario: PerfScenario): Promise<PerfResult> => {
    const n = await tuneN(scenario);

    // Warmup: keep calling run() (re-batching as needed) for ~100ms so
    // V8 fully optimizes hot functions before any sample is recorded.
    const warmupEnd = now() + WARMUP_MS;
    while (now() < warmupEnd) {
        const batch = scenario.setupBatch ? await scenario.setupBatch() : undefined;
        await scenario.run(batch);
    }

    // Measurement window. We sample as many runs as fit into the
    // budget. Each sample is ms-per-run-of-N-ops; we convert to
    // μs-per-op by dividing by n at report time.
    const samplesMs: number[] = [];
    const budgetEnd = now() + MEASURE_BUDGET_MS;
    while (now() < budgetEnd) {
        const batch = scenario.setupBatch ? await scenario.setupBatch() : undefined;
        const start = now();
        await scenario.run(batch);
        const elapsed = now() - start;
        samplesMs.push(elapsed);
    }

    await scenario.cleanup().catch(() => undefined);

    if (samplesMs.length === 0) {
        // Pathological: even a single run blew the budget. Report
        // a single sample so callers can still see SOMETHING.
        return {
            name: scenario.name,
            n,
            samples: 0,
            meanUs: NaN,
            minUs: NaN,
            p50Us: NaN,
            p99Us: NaN,
            opsPerSec: NaN,
        };
    }

    const samplesUs = samplesMs.map(ms => (ms * 1000) / n);
    const sorted = [...samplesUs].sort((a, b) => a - b);
    const mean = samplesUs.reduce((a, b) => a + b, 0) / samplesUs.length;
    const min = sorted[0]!;
    const p50 = percentile(sorted, 50);
    const p99 = percentile(sorted, 99);
    const opsPerSec = mean > 0 ? 1_000_000 / mean : Infinity;

    return {
        name: scenario.name,
        n,
        samples: samplesMs.length,
        meanUs: mean,
        minUs: min,
        p50Us: p50,
        p99Us: p99,
        opsPerSec,
    };
};

/**
 * Run all scenarios sequentially and print a results table.
 */
export const runAll = async (scenarios: readonly PerfScenario[]): Promise<readonly PerfResult[]> => {
    const results: PerfResult[] = [];
    for (const scenario of scenarios) {
        process.stdout.write(`  ${scenario.name} ... `);
        const start = now();
        try {
            const result = await runScenario(scenario);
            results.push(result);
            const wall = ((now() - start) / 1000).toFixed(1);
            process.stdout.write(`${result.meanUs.toFixed(2)} μs/op  (${result.samples} samples, ${wall}s wall)\n`);
        } catch (err) {
            process.stdout.write(`FAILED: ${(err as Error).message}\n`);
            throw err;
        }
    }
    printTable(results);
    return results;
};

const printTable = (results: readonly PerfResult[]): void => {
    if (results.length === 0) return;
    const rows = results.map(r => ({
        scenario: r.name,
        N: r.n,
        samples: r.samples,
        "μs/op (mean)": r.meanUs.toFixed(2),
        "μs/op (min)": r.minUs.toFixed(2),
        "μs/op (p50)": r.p50Us.toFixed(2),
        "μs/op (p99)": r.p99Us.toFixed(2),
        "ops/sec": Math.round(r.opsPerSec).toLocaleString(),
    }));
    if (typeof console.table === "function") {
        console.table(rows);
    } else {
        for (const row of rows) console.log(row);
    }
};
