// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "vite";

const headers = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

/** Shared memory needs cross-origin isolation, on every response the dev, preview and browser test servers send. */
export const isolation: Plugin = {
    name: "cross-origin-isolation",
    enforce: "pre",
    config: () => ({ server: { headers }, preview: { headers } }),
};
