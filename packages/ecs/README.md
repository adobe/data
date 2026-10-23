# @adobe/ecs

A high-performance Entity Component System for web-based applications, simulations and games.

## Features

- **Linear, gapless structure-of-arrays component storage**
  - Fixed-length values (numbers, tuples, structs) in a `SharedArrayBuffer`
    - Shared across the main thread and all workers
    - Read by WASM kernels without copying
    - WebGPU-compatible struct layout for fast uploads
  - WebGPU storage for GPU system kernels
    - Synced back to shared memory only when the CPU reads it
  - Strings in shared memory, readable on every thread
  - Objects and other variable-length values on the thread that owns them
- **Systems**
  - Plain TypeScript bodies with declared reads and writes
  - Kernels compiled and checked at build time to optimized JavaScript, WASM and WGSL
  - Balanced scheduling across the main thread, workers and the GPU
  - Typed input, with its schema generated from the TypeScript type
  - Render systems that draw straight from component storage
  - Observer systems for reading state into a UI
- **Changes**
  - Per-component added and changed ticks: an O(1) check per entity, with each change seen exactly once
  - Filters that skip unchanged chunks and 64-row blocks
  - Structural changes batched at sync points, so memory never moves while systems run
  - Rules, finalizers and traits for derived components, cleanup and references
- **Queries**
  - Hash, unique, sorted and keyless indexes, all updated incrementally
  - Hierarchy traversal that reruns only below what changed
- **Threads**
  - Worlds shared with other threads through a `MessagePort` or worker
  - Joined threads run their own systems and observers, and lend their workers to the pool
- **Runtime**
  - Kernels allocate nothing per row; commands, lookups and reports reuse their buffers
  - Errors reported as data, in each run's report

## Guide

See the [guide](src/guide/guide.md) for how to use it.
