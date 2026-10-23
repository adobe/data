# @adobe/ecs

A data-oriented entity component system. Systems run on the main thread, on worker threads, as WASM kernels or on the GPU.

## Features

- **Shared columnar storage.** Components are stored as structure-of-arrays columns. Numbers, tuples, structs and
  strings live in a `SharedArrayBuffer` that every thread reads, and objects stay on the thread that owns them.
- **Declared reads and writes.** Each system lists the components and resources it reads and writes. The scheduler uses
  those lists to order systems and to run the ones that don't conflict at the same time.
- **Deferred structure.** Spawning, despawning, adding and removing components are commands. They apply at sync points
  in the order they were issued, so memory never moves while systems run. Value writes take effect immediately.
- **One body, four places to run.** The same system body can run on the main thread, on a worker pool, as a WASM
  kernel or as a WebGPU compute shader. A Vite plugin compiles kernels at build time and checks their reads and writes
  against the declaration. A GPU kernel runs on the CPU when there's no device. Render systems record WebGPU draws
  directly from component storage, optionally in an index's order.
- **Change detection.** Every component of every entity has an added tick and a changed tick, so each system sees each
  change exactly once. Change filters skip unchanged chunks and unchanged 64-row blocks without visiting their rows.
- **Indexes and lookups.** Indexes can be hash, unique, sorted (with ranges, pages and `order` runs) or keyless. Lookups
  return rows in entity order, and they report whether anything entered, left or moved.
- **Hierarchies.** `up` walks parent references from roots to leaves and reruns only the chains below what changed.
- **Rules, finalizers and traits.** Rules derive components from structure. A finalizer runs for each entity that
  stops matching and reads its values from before. Traits declare behaviors such as despawning an entity along with the
  entity it refers to.
- **Typed input.** A system's input is the TypeScript type of its body's parameter. The plugin turns that type into the
  runtime schema at build time.
- **Observer systems.** These read state after every sync point, and they're how a UI reads the world. They can run on
  the world's thread or on a thread that joined it.
- **Threads.** A world can be shared with other threads through a `MessagePort` or a worker. Joined threads run
  systems and observers, and they can lend their workers to the pool.
- **Errors as data.** `run` resolves to a run number. Failures, skipped systems and warnings for that run are spawned as
  a report entity instead of being thrown.

## Performance

Per-frame work is kept as low as possible, and nothing is allocated per row or per run. Below are some recorded
results from an Apple M1 Max with node 24, one thread unless noted. See [perf/README.md](perf/README.md) for every
benchmark, Chromium's worker and GPU results, and the history of each.

| Benchmark | Time |
|---|---:|
| Kernel adding velocity to position, 250K rows | 0.09 ms |
| Same, on workers in Chromium | 0.015 ms |
| Six dependent kernels fused into one pass, 1M rows | 1.56 ms |
| Change-filtered system, 1M rows with few changed | 0.32 ms |
| Hierarchy update after one root moved, 1M rows | 0.024 ms |
| Idle run | 0.33 µs |
| Run with one spawn and its sync point | 0.83 µs |
| Bulk spawn from a kernel, 100K entities | 1.05 ms |
| Sorted range lookups, 10K over 1M entities | 5.6 ms |
| Index rebuild, 1M entities | 26.9 ms; 6.9 ms on workers in Chromium |

The velocity kernel runs within 1.24× of the time it takes just to move its bytes at the measured copy bandwidth.

## Guide

See the [guide](src/guide/guide.md) for how to use it.
