# ecs-benchmark

The scenarios of [ecs_benchmark](https://github.com/abeimler/ecs_benchmark), a suite of C++ ECS benchmarks, on
`@adobe/ecs`, against the suite's own C++ libraries: EnTT, EntityX, Ginseng, mustache, Flecs, pico_ecs, gaia-ecs and its
plain OOP baseline, on one thread and on many. This machine's results are in [`results/comparison.md`](results/comparison.md).

## Running

| Script | What it does |
|---|---|
| `pnpm test` | Checks, on every lane, that the ported systems compute what the suite's C++ does, frame by frame, against a plain JS reference of it; and that create, destroy, remove-and-add and the gets do what they're asked. Fast, and needs no C++ toolchain. |
| `pnpm bench` | `scripts/ours.mjs`: bundles the benchmarks for node and runs each benchmark at 16K, 256K and 1M entities, each in a process of its own, on three lanes, into `results/ours/<lane>.json`, and compares each result with the last this machine recorded, listing what's more than 10% slower as regressions. |
| `pnpm bench:full` | `bench` at every count of entities from 1 to 2M. |
| `pnpm bench:record` | `bench:full`, appending its results to `results/history/<machine>.jsonl`, which later runs compare with. |
| `pnpm bench:cpp` | `scripts/cpp.mjs`: fetches the suite at its pinned commit into `cpp/` (gitignored), applies `patches/`, builds it Release with CMake and Ninja, and runs its Google Benchmark binaries, single-threaded and with the patch's threads, into `results/cpp/<lane>/<binary>.json`. Needs CMake, Ninja, a C++20 compiler and git. `--suite <checkout>` copies an existing checkout of the pinned commit instead of cloning. |
| `pnpm compare` | `scripts/compare.mjs`: merges the results into `results/comparison.md`. |
| `pnpm bench:gpu` | `scripts/gpu.mjs`: the GPU lane, below, in headless Chromium on this machine's GPU. `--compare <entities>` runs 20 frames of it on the GPU and on the CPU and lists which words of each component's rows differ. |
| `pnpm bench:all` | All three, in order. Takes about an hour and a quarter here; run it on an idle machine, under `caffeinate -i` on macOS. |

`bench` and `bench:cpp` take `--sizes 1024,1048576` and `--lane`; `bench` takes `--filter <regular expression>` over
benchmark names, `--full`, `--through` (below) and `--record`. CI runs only `test`. The full sweep takes about an
hour, so it's for refreshing the committed results, not for every change: measure what a change touches with
`--filter` and `--sizes`.

Times compare only on the same hardware, so the history is kept per machine. Record after a change to the ECS that
should move these numbers, and run `pnpm bench:quick` before one to see what it moved.

Besides the suite's benchmarks, with `--through`, `BM_ComplexSystemsUpdate_Through_<System>` and
`BM_ComplexSystemsUpdateMixedEntities_Through_<System>` time a frame of the 7-system benchmark's systems up to and
including that one, ours and, with `patches/systems-prefix.patch`, Flecs's and mustache's. One less the one before is
what that system costs as a frame runs it, with the data in the state the systems before it leave, which timing a
system alone doesn't give. The comparison lists each system's cost so.

## What runs

`src/scenarios/model` holds the suite's components, its seven systems (`MovementSystem`, `DataSystem`,
`MoreComplexSystem`, `HealthSystem`, `DamageSystem`, `SpriteSystem`, `RenderSystem`) and the entities each benchmark
makes, ported line for line: the same counts and loops, the same widths (`float` is `F32`, `double` is `number`, the
integers `I32` and `U32`), the suite's xoshiro128** generator exactly, and the frame buffer a `Uint8Array` of character
codes. `src/perftest` measures them.

Each benchmark is timed as an app pays for it:

- **A frame** (`BM_SystemsUpdate`, `BM_ComplexSystemsUpdate` and their `MixedEntities` variants) is one `world.run` of
  the systems as one composite, its scheduling and sync point included. Each system that shares components with one
  the suite runs before it runs after it, so results match the suite's order.
- **Create, destroy and remove-and-add** are a run whose commands make the change, including the sync point that
  applies them. `BM_CreateEntities` and `BM_DestroyEntities` each time one run on a new world, as the suite times each
  iteration on a new registry; `BM_RemoveAddComponent` removes component one from every entity at one sync point and
  adds it back at the next.
- **Gets** (`BM_UnpackOneComponent`, `Two`, `Three`) are one run of a system over probes, one per entity of the
  suite's vector of entities and in its order, each getting the components of its entity through a lookup and adding
  every value it read to a reduction, as the suite's `DoNotOptimize` keeps each read.
- **Times** are the median of 30 samples after a warm-up of at least a second and 50 runs, enough for V8 to have
  optimized the bodies, tiered WASM up from its baseline compiler and started the pool's workers. The world is then
  emptied, set up again and run 200 times untimed, which brings the pool's cores back up to speed, before the samples,
  so every measurement times the same states of the entities' data, which moves on with each run and decides how much
  work a run does. A frame's sample is the mean of ten frames: every entity's `thingy` steps together, so
  `MoreComplexSystem` draws new directions for all of them on one frame in ten, which a median of single frames would
  skip. The C++ times are the median of Google Benchmark's three repetitions, each its mean over its own iterations.
- **Destroy warms up** with a create and destroy of as many entities first, so the pool has started and loaded the
  kernel, as in an app that destroyed before.

The lanes:

| Lane | Kernels | Threads |
|---|---|---|
| `js` | compiled to JS: a page without cross-origin isolation, made in node by `crossOriginIsolated` being `false` | the world's |
| `wasm` | compiled to WASM | the world's |
| `threads` | compiled to WASM | the world's and a pool worker for every other hardware thread |
| `gpu` | compiled to WGSL, as `kernel: "gpu"` | the GPU's, in headless Chromium |

Every row system is a kernel (`kernel: true`). `RenderSystem` writes the frame buffer, a `Uint8Array` resource, in
place; on the `threads` lane it runs on one thread, as a kernel writing a typed array under 256 KiB does, since cores
writing one at once take its cache lines from each other, and as the C++ libraries keep it on one thread under the
patch.

The `gpu` lane runs its own frames, `GPU_SystemsUpdate`, `GPU_ComplexSystemsUpdate` and their `MixedEntities`
variants: the same systems as GPU kernels, over data whose `dingy` is an f32, since GPU kernels compute in f32 where
the suite's is a double. It's a lane of its own, not the suite's benchmarks, and compares only with the CPU's frames
loosely. `scripts/gpu.mjs` serves the page with Vite and the ECS's compiler plugin, cross-origin isolated, and drives
headless Chromium with `--enable-unsafe-webgpu`, which gets the machine's GPU: on macOS, Metal. A sample is ten
frames given to the GPU one after another and one wait for the GPU to have done them, as an app's frames are given;
components stay on the GPU between frames. Its `wasm` runs of the same frames run GPU kernels as kernels on the CPU,
computing as their bodies are written.

## Where it stands

At 1M entities on an Apple M1 Max, in ns per entity, the fastest of the suite's libraries against ours (all of
[`results/comparison.md`](results/comparison.md) has every size and library):

| Benchmark | Fastest C++, 1 thread | Ours, WASM, 1 thread | Flecs, 10 threads | Ours, 10 threads |
|---|---|---|---|---|
| 7 systems | 5.75 (mustache) | 6.5 | 1.98 | 2.47 |
| 7 systems, mixed | 4.64 (mustache) | 4.95 | 1.53 | 1.77 |
| 2 systems | 2.03 (Flecs) | 2.12 | 0.631 | 0.719 |
| 2 systems, mixed | 2.0 (mustache) | 2.1 | 0.656 | 0.703 |
| Create entities | 20.3 (Ginseng) | 26.5 | | 26.6 |
| Destroy entities | 9.62 (pico_ecs) | 25.8 | | 20.7 |
| Get one, two, three components | 0.95, 1.59, 1.11 (pico_ecs) | 2.65, 3.28, 4.18 | | 0.497, 0.625, 0.759 |
| Remove and add a component | 5.6 (pico_ecs) | 41 | | 33.8 |

Where the frames are behind, measured system by system with the `--through` frames and against the same loops
compiled natively with clang and hand-written in WASM:

- **Scalar code runs about 20% behind native.** `MoreComplexSystem`'s kernel is as fast as the same loop written by
  hand in WASM, light frames and heavy alike, and clang's native loop is about 20% faster than both.
- **`HealthSystem` is branch prediction on this data.** clang doesn't vectorize it: its native loop branches, which a
  predictor learns on the suite's entities, whose rows repeat in short periods (0.64 ns a row on rows alike, 1.07 on
  random ones). Ours runs four rows at a time as masks, 0.93 either way; skipping arms no row of a group takes loses
  here, since groups of four agree less often than neighboring rows repeat.
- **`DataSystem`'s double and boolean fields are a load and a store a row,** natively as in ours; they cost 0.3 ns of
  its 1.8.
- **On threads, `RenderSystem` runs on one thread,** as the C++ libraries keep it: cores writing the 75 KiB frame
  buffer at once take its cache lines from each other, so random byte writes into it run twice as fast on one core as
  on ten. It then reads what the systems before it wrote on other cores, which costs its thread about 0.1 ns a row
  over the one-thread lane. Flecs's split of its frame puts its render at about nothing, which frames differing by
  noise give; mustache's costs 1.3.

The create, destroy, get and remove-and-add benchmarks haven't been looked into this way. `pico_ecs` and Ginseng keep
components in sparse arrays, where an archetype store like ours, or Flecs's, moves a row between archetypes for each
structural change; Flecs takes 119 ns to remove and add a component.

The `gpu` lane at 1M entities, f32 `dingy`: 0.52 ns for 2 systems and 0.99 for 7, 0.55 and 0.93 mixed; at 16K, the
GPU's dispatches cost 5 to 10 ns an entity, so small worlds run faster on the CPU.

## What compares, and what doesn't

- **Ours includes more than the C++ does.** A run schedules its systems, checks the pool, advances change ticks, keeps
  every write's changed tick, and ends at a sync point; a C++ `update` is a loop over each system. Small counts measure
  mostly that per-run cost; per-entity costs at 64K and more measure the systems.
- **Native against JS.** The C++ is `-O3` with link-time optimization; ours runs on V8, its kernels as JS or WASM.
- **Gets resolve once per entity.** One lookup gives every component it lists; the suite calls a getter per
  component, which some libraries resolve again each time.
- **Destroy is a system despawning each row,** where the suite loops over its vector of entities.
- **The player's generator is seeded from its index,** so about 3% of random players are NPCs, 27% heroes and 70%
  monsters, as the suite's rates intend. The suite default-constructs it, which seeds it from its address, and the
  addresses each library gives make the mix its own: at 64K entities in `BM_SystemsUpdate`, EnTT made 56% heroes,
  EntityX and Ginseng all monsters, mustache all heroes, Flecs and pico_ecs all NPCs (its counters). The systems do
  the same work for every type but `SpriteSystem`'s branch and `DamageSystem`'s numbers.
- **The sprite's `char` is a `U32`,** the ECS's narrowest integer component.
- **Entities drawn at one cell overwrite each other in storage order,** which differs between libraries, so the test
  checks each cell holds one of the characters drawn there.

## Our changes to the suite

- `patches/pin-dependencies.patch` fetches the libraries the suite follows on a branch at their last commit before
  the suite's (2024-08-16): EntityX `bd16293`, Ginseng `8839ef9`, mustache `767aa96`, pico_headers `433f25f`. On
  their branches today mustache builds only for x86 and pico_ecs's API has changed.
- `scripts/cpp.mjs` defines `gsl_CONFIG_DEFAULTS_VERSION=0`: vcpkg, unpinned in the suite, gives gsl-lite 1.x, whose
  defaults drop the `gsl` namespace the suite uses.
- `patches/multi-threaded.patch` adds the threaded variant, only where `ECS_BENCHMARK_THREADS` is defined, as it is in
  `cpp/build-threads`, to the machine's hardware threads: Flecs calls `set_threads(ECS_BENCHMARK_THREADS)` (its main
  thread and a worker for each other one) and marks every system but render `multi_threaded`; mustache runs every
  system but render with `JobRunMode::kParallel`, on its dispatcher's default of a worker for every hardware thread but
  the main one. gaia-ecs is left out: the suite's gaia-ecs 0.8.6 has no parallel query execution, only a job system
  over which the port would need a chunk scheduler of its own. The other libraries have no threading of their own.
