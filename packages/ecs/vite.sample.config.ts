import { defineConfig } from "vite";
import { kernelPlugin } from "./src/implementation/compiler/index.ts";
import { isolation, sources } from "./vitest.plugins.ts";

/** Serves `src/samples`, one folder per sample, cross-origin isolated for shared memory: `pnpm sample` opens /particles/. */
export default defineConfig({
    root: "src/samples",
    plugins: [kernelPlugin(), isolation, sources],
    server: { open: "/particles/" },
});
