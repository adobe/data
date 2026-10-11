# Performance

Measured on an Apple M1 Max (8 performance cores, 2 efficiency cores). Node numbers come from `pnpm perf`, a Vite bundle run on plain node; vitest's node transform turns imported bindings into getters and roughly doubles JS-heavy costs, so it is not used for comparisons. Browser numbers come from `pnpm test:perf` in chromium with real workers, where timers are quantized to 5 µs; "framed" numbers run once per animation frame and report the median and 90th percentile, which vary up to 2× between sessions. Every number is the fastest run within a time budget.

## Results

Baseline is commit `a28ba8cb`, before the optimization pass.

| Benchmark | Baseline | Now | Gain |
|---|---|---|---|
| create 100K (spawn plus sync point) | 170 ms | 27.6 ms | 6.2× |
| churn 100K (despawn and respawn 10%) | 17.0 ms | 5.05 ms | 3.4× |
| retag 100K (archetype moves for 20%) | 18.0 ms | 7.04 ms | 2.6× |
| emit 100K (commands from a kernel) | 6.65 ms | 0.97 ms | 6.9× |
| sparse changed 1M, uniform 1% | 3.48 ms | 1.15 ms | 3.0× |
| sparse changed 1M, clustered 1% | 3.13 ms | 0.021 ms | ~150× |
| follow 100K (a lookup per row) | 10.6 ms | 0.38 ms | 28× |
| move 1M (250K rows processed) | 0.259 ms | 0.095 ms | 2.7× |
| chain, 6 dependent kernels over 100K | 0.476 ms | 0.343 ms | 1.4× |
| main thread, 50 systems over 1K | 2.89 ms | 1.64 ms | 1.8× |
| select 100K (`where` plus reads) | 18.1 ms | 3.1–4.5 ms | ~5× |

Chromium:

| Benchmark | Main thread | Workers (default pool) |
|---|---|---|
| move 1M | 0.305 → 0.105 ms | 0.105 → 0.020 ms |
| follow 100K | 8.76 → 0.44 ms | 1.02 → 0.075 ms |
| chain 6×100K | 0.67 → 0.405 ms | 0.455 → 0.115 ms |
| sparse changed 1M | 4.78 → 1.095 ms | 0.74 → 0.19–0.25 ms |

At 1M entities, against commit `d6373560` (claimed splits in place):

| Benchmark | Before | Now |
|---|---|---|
| create 1M | 325 ms | 296–316 ms |
| churn 1M | 54 ms | 30 ms |
| retag 1M | 79 ms | 48.5 ms |
| emit 1M | 11.2 ms | 10.6 ms |
| move 1M | 0.177 ms | 0.091 ms |
| chain 6×1M | 3.42 ms | 1.51 ms |
| main thread 50×1K | 1.65 ms | 0.48 ms |
| follow 1M, select 1M, sparse changed 1M | | unchanged |
| chromium move 1M, main / workers | 0.20 / 0.030 ms | 0.095 / 0.015 ms |
| chromium chain 6×1M, main / workers | 4.47 / 0.725 ms | 1.72 / 0.275 ms |

The adobe/data ECS runs move 1M in 0.09 ms, single threaded with WASM SIMD, and creates 100K in 5.8 ms by inserting directly, with no command buffer or sync point.

## Where the gains came from

Step figures marked (vitest) are from the node vitest lane: read them as relative.

**Structural changes.**
- Commands as parallel typed arrays, a reusable typed plan, and cached archetype edges: create 198 → 68 ms, churn 22 → 10 ms, retag 24 → 11.7 ms, emit 7.3 → 3.1 ms (vitest).
- `Object.keys` instead of `for…in`, and buffers reused across runs: small gains.
- Allocation-free kernel commands (`begin`/`value`/`component`/`spawn`): emit 3.2 → 1.98 ms (vitest).
- Inline value writes instead of closures, an 8-shape spawn cache, edges indexed by component id, archetypes grown once per sync point: create 38 → 27.6 ms.

**Change filters.**
- Chunk ticks, the newest tick per 1024 rows, so filters skip unchanged chunks: clustered sparse to ~0.09 ms.
- Filters inside WASM kernels, one call per archetype instead of one per passing range: uniform sparse 3.5 → 1.15 ms, clustered to 0.02 ms.

**Lookups.**
- Precompiled matchers with component ids resolved once: follow 10.4 → 4.8 ms.
- Lookups in WASM through a directory per lookup in shared memory: follow 4.8 → 0.37 ms. Exact entity decoding costs about 0.07 ms, partly recovered by an integer fast path.

**Kernel hot path.**
- Full 16-byte loads for three-lane rows: move 0.262 → 0.204 ms.
- Four rows of whole interleaved elements as full vectors (three for tight vec3) instead of one partial vector per row: move 0.177 → 0.095 ms, chain 6×1M 3.5 → 1.55 ms, chromium main thread move 0.200 → 0.105 ms.
- `changed` stamps only for observed components: move 0.204 → 0.175 ms, chain 0.47 → 0.344 ms.
- Tick columns only for components some system filters on, started at the current tick when the first one registers: create 1M 325 → 296 ms, retag 1M 79 → 68 ms, churn 1M 54 → 50 ms. For the particle fixture, ticks were 80 of 112 bytes per entity.
- Exact integer `%` in WASM instead of a JS import.

**Dispatch.** A task ring per worker in shared memory with `Atomics.notify`, and fast kernels split at half the minimum chunk: chain on workers 0.485 → 0.255 ms, then 0.16 ms with the kernel gains.

**Claimed splits.** Workers claim pieces of a WASM kernel's rows from a shared counter instead of taking even shares, so the slowest core no longer sets the finish time: on the default pool, move 0.055 → 0.030 ms, follow 0.15 → 0.075 ms, chain 0.16 → 0.115 ms, sparse changed 0.30 → ~0.22 ms.

**Affinity claims.** Each worker owns a home range of a split's pieces, the same one every run, takes them from the front, and steals from the back of the fullest other range once its own is empty. Pieces stay on the same worker from one tier to the next 75% of the time instead of 13% (no better than chance), so tier N+1 finds its rows in the cache tier N warmed: chain 6×1M on workers 0.79–0.87 → 0.275 ms, per tier 230 → 170 µs in traced medians; move 1M on workers 0.020 → 0.015 ms. Control words, claim words and status slots each take whole 128-byte cache lines, so a store by one thread doesn't invalidate the line another polls.

**Main thread.** Compiled `select` predicates: 18 → ~3.5 ms. Row getters chosen once, and tuple reads and writes in one loop: 50 systems 3.2 → 1.63 ms (vitest).
- Accessor rows each get their own prototype. Built from `{}`, every row after the first that defines an accessor with another getter went to V8 dictionary properties. One row per set of reads and writes, shared across systems and archetypes and rebound per pass, so a body sees one shape; f32-lane tuples read as array literals, and scalars and f32 lanes written directly. Resource cells in a context are resolved once per run. On node: 50 systems 1.1 → 0.45 ms, churn 55 → 32 ms, retag 74 → 59 ms; 50 distinct bodies over three row shapes 1.75 → 0.53 ms; two writing systems over 100K 19.5 → 1.9 ms; 20 systems reading a resource per row 1.26 → 0.22 ms.

## Worker scaling

move, chromium, by worker count and entity count (a quarter of the entities move), with even shares:

| Workers | 1M | 4M | 10M |
|---|---|---|---|
| 0 (main thread) | 0.200 ms | 0.785 ms | 1.98 ms |
| 1 | 0.195 ms | 0.785 ms | 1.97 ms |
| 2 | 0.100 ms | 0.410 ms | 1.01 ms |
| 4 | 0.045 ms | 0.215 ms | 0.535 ms |
| 6 | 0.030 ms | | 0.500 ms |
| 7 | 0.025 ms | 0.150 ms | 0.56 ms |
| 8 | 0.060 ms | | 0.555 ms |
| 9 (default) | 0.055 ms | | 0.575 ms |

- **Dispatch overhead is not the limit.** Scaling is linear up to 7 workers at 1M: 0.025 ms is 8× the main thread and 3.6× the adobe/data ECS.
- **Even shares wait for the slowest core.** The default pool is `hardwareConcurrency − 1`, which is 9 here. Past 7 workers, shares land on efficiency cores or share a core with the main thread, so 1M more than doubles. Browsers expose no core types or thread placement, so claimed splits fix this instead: with them, 1M takes 0.030 ms at 7, 8 and the default 9 workers. Pieces per worker (4, 8 or 16) made no measurable difference.
- **At 10M the work is memory bound.** 2.5M rows read 24 bytes and write 12, about 90 MB per run; 0.5 ms is about 180 GB/s, near the chip's CPU bandwidth. It stops improving after 4 to 6 workers, and more entities would not change that.
- **Single-threaded move matches the adobe/data ECS** (0.095 ms against 0.09 ms): four tight vec3 rows are three full vectors, as its separate x, y and z arrays are.

## Tried and not kept

- **U32 ticks:** no measurable gain on the non-sparse 1M benchmarks, 10% on uniformly sparse filters, and change filters go wrong past 2³² ticks unless a clamp pass is added. With ticks kept only where observed, it would help only observed components.
- **Commands encoded from WASM:** emit 1M 11.2 → 9.2 ms on the main thread and no gain on workers, for about 800 lines across the compiler, code generation, runner, pool, worker and sync point. The sync point is most of emit's time.
- **Workers spinning 0.15 ms instead of 0.05 ms before waiting:** chain 6×1M on workers 0.83 → 0.525 ms back to back, but only because it bridges the gap between consecutive benchmark runs; per frame it measured the same.
- **Holding workers spinning while a later tier of the run has kernels,** with no time constant: per frame the same, and move's best case on workers 0.020 → 0.040 ms. Traces showed the 0.05 ms spin already keeps workers awake across tiers (each tier is seen within about 5 µs).
- **Home ranges sized by each worker's recent share of pieces:** no gain (chain 0.275 → 0.29 ms). Shares never settle: apart from the slowest few workers, each swings by about 40% between rounds, so the sizing chases noise and moves range boundaries, which costs affinity.
- **The main thread claiming pieces too:** no gain; workers that wake late are slow at first, so the main thread does about what it would alone.
- **A loop per main-thread system** (eval or emitted by the plugin): 5–10% on top of fast-property rows.

## Next

- Single-tier runs on workers: workers asleep at the start of a run take 60–135 µs to see the task, and 2–4 of 9 find nothing left to claim.
- Idle cores clock down: after 5 ms idle, even the main thread runs move 2–4× slower per frame, and keeping one other core busy removes most of it, at 10M too. That's the OS's power policy, not something dispatch can avoid without spending power.
- Emit and other command-heavy kernels: the sync point dominates.
