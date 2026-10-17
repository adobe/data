import { defineConfig } from "vite";
import { kernelPlugin } from "./src/implementation/compiler/index.ts";
import { isolation, sources } from "./vitest.plugins.ts";

/** Serves the samples, cross-origin isolated for shared memory: `pnpm sample`, then open /samples/particles/. */
export default defineConfig({
    plugins: [kernelPlugin(), isolation, sources],
    server: { open: "/samples/particles/" },
});
