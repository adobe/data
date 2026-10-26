# @adobe/ecs

A high-performance, multithreaded Entity Component System for web-based applications, simulations and games.

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
- **Declarations**
  - Components and resources declared once, as TypeScript types; the build registers them
  - Named types such as `F32`, `U32` and your own `Schema.Type`s give storage precision, width and bounds
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
  - Kernels allocate nothing per row; commands and lookups reuse their buffers
  - Runs resolve to what a body returns, and reject naming each system that failed; ticks' failures are reported out of
    band, once per failing system

## Setup

Install it with `npm install @adobe/ecs`, and build with its plugin:

```ts
// vite.config.ts
import { Compiler } from "@adobe/ecs/compiler";
export default defineConfig({ plugins: [Compiler.plugin()] });
```

A library builds with `Compiler.plugin({ library: true })`, so its build ships the registrations its declarations give.

## Guide

See the [guide](https://opensource.adobe.com/data/ecs/samples/#ecs-guide) for how to use it, each chapter's program edited
and run in the browser beside its prose, and the [API reference](https://opensource.adobe.com/data/ecs/) for every type and
function. The guide is the `ecs-guide` package in this package's repository, its chapters in `src/guide`.
