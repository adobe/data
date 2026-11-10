# Overview

A high-performance, multithreaded Entity Component System for web applications, simulations and games. You write
components, resources and systems in plain TypeScript; the build compiles each system's body to run as fast as the
machine allows, on one thread, on every core or on the GPU, with the same results.

- **Storage:** components in gapless structure-of-arrays columns in shared memory, which every thread and every WASM
  kernel reads in place, and which upload to WebGPU without conversion. Strings live in shared memory too; objects stay
  on the thread that owns them. Resources include typed arrays of a fixed length, written in place.
- **Declarations:** each component and resource is declared once, as a TypeScript type; the build reads its schema,
  and types such as `F32`, `I32` and `U32` give its width, precision and range.
- **Kernels:** row systems compile at build time to JavaScript, WASM and WGSL. WASM kernels run four rows at a time
  in SIMD lanes, as masks where they branch, in 32-bit integers where the types allow. Kernels a frame runs one after
  another over shared components fuse into one pass.
- **Scheduling:** systems run in parallel tiers from what they read and write, across a pool of workers that claim
  pieces of the rows, the GPU and the main thread; structural changes wait for sync points, so memory never moves
  while systems run.
- **Changes:** every component keeps added and changed ticks, so a system sees each change once, and its filters skip
  unchanged chunks and blocks of rows.
- **Queries:** hash, unique, sorted and keyless indexes, all kept incrementally; lookups; hierarchies that rerun only
  below what changed; rules, finalizers and traits for derived components, cleanup and references.
- **Threads and the GPU:** worlds share themselves with other threads, which run their own systems; GPU kernels and
  render systems keep their components on the GPU until the CPU reads them.

The chapters start with [Setup](00-setup.md) and each shows one part of it in a program you can run.
