# Performance

Measured on an Apple M1 Max (8 performance cores, 2 efficiency cores). Node numbers come from `pnpm perf`, a Vite bundle run on plain node; vitest's node transform turns imported bindings into getters and roughly doubles JS-heavy costs, so it is not used for comparisons. Browser numbers come from `pnpm test:perf` in chromium with real workers, where timers are quantized to 5 µs. Every number is the fastest run within a time budget.

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
| move 1M (250K rows processed) | 0.259 ms | 0.177 ms | 1.5× |
| chain, 6 dependent kernels over 100K | 0.476 ms | 0.343 ms | 1.4× |
| main thread, 50 systems over 1K | 2.89 ms | 1.64 ms | 1.8× |
| select 100K (`where` plus reads) | 18.1 ms | 3.1–4.5 ms | ~5× |

Chromium:

| Benchmark | Main thread | Workers (default pool) |
|---|---|---|
| move 1M | 0.305 → 0.200 ms | 0.105 → 0.030 ms |
| follow 100K | 8.76 → 0.44 ms | 1.02 → 0.075 ms |
| chain 6×100K | 0.67 → 0.405 ms | 0.455 → 0.115 ms |
| sparse changed 1M | 4.78 → 1.095 ms | 0.74 → 0.19–0.25 ms |

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
- `changed` stamps only for observed components: move 0.204 → 0.175 ms, chain 0.47 → 0.344 ms.
- Exact integer `%` in WASM instead of a JS import.

**Dispatch.** A task ring per worker in shared memory with `Atomics.notify`, and fast kernels split at half the minimum chunk: chain on workers 0.485 → 0.255 ms, then 0.16 ms with the kernel gains.

**Claimed splits.** Workers claim pieces of a WASM kernel's rows from a shared counter instead of taking even shares, so the slowest core no longer sets the finish time: on the default pool, move 0.055 → 0.030 ms, follow 0.15 → 0.075 ms, chain 0.16 → 0.115 ms, sparse changed 0.30 → ~0.22 ms.

**Main thread.** Compiled `select` predicates: 18 → ~3.5 ms. Row getters chosen once, and tuple reads and writes in one loop: 50 systems 3.2 → 1.63 ms (vitest).

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
- **Single-threaded move is 2× slower than the adobe/data ECS** (0.2 ms against 0.09 ms), so the kernel itself still has room.

## Next

- Single-threaded move: close the 2× gap with the adobe/data ECS.
- U32 ticks: uniformly sparse change filters are bound by memory bandwidth.
- Compiled main-thread systems: accessor rows copy tuples on every read and share one call site.
- Commands encoded from WASM: kernels that issue commands still run as JS.
