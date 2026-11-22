// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { isolation } from "./isolation.ts";

/** Serves and builds the page in `src`, into `dist`, cross-origin isolated for shared memory. */
export default defineConfig({
    root: fileURLToPath(new URL("src", import.meta.url)),
    plugins: [Compiler.plugin(), isolation],
    build: { outDir: fileURLToPath(new URL("dist", import.meta.url)), emptyOutDir: true },
});
