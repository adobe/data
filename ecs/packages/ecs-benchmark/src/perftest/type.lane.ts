// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * How a run uses the machine: `js`, kernels in JS on one thread, as a page without cross-origin isolation runs them;
 * `wasm`, kernels in WASM on one thread; `threads`, kernels in WASM on the worker pool.
 */
export type Lane = "js" | "wasm" | "threads";
