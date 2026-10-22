// © 2026 Adobe. MIT License. See /LICENSE for details.

import { resolve } from "node:path";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

export default defineConfig({
    plugins: [checker({ typescript: true })],
    optimizeDeps: {
        // Legacy decorators and `useDefineForClassFields: false`, as tsconfig.json sets for sources.
        rolldownOptions: {
            transform: {
                decorator: { legacy: true },
                assumptions: { setPublicClassFields: true },
                typescript: { removeClassFieldsWithoutInitializer: true },
            },
        },
    },
    root: ".",
    build: {
        outDir: "dist",
        rolldownOptions: {
            input: {
                main: resolve(import.meta.dirname, "index.html"),
                sub: resolve(import.meta.dirname, "sub.html"),
            },
        },
    },
    server: { port: 3011, open: false },
});
