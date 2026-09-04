// © 2026 Adobe. MIT License. See /LICENSE for details.

import { resolve } from "node:path";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

export default defineConfig({
    plugins: [checker({ typescript: true })],
    optimizeDeps: {
        esbuildOptions: {
            tsconfigRaw: {
                compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
            },
        },
    },
    root: ".",
    build: {
        outDir: "dist",
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                sub: resolve(__dirname, "sub.html"),
            },
        },
    },
    server: { port: 3011, open: false },
});
