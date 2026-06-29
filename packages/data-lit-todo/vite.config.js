import { defineConfig } from "vite";

export default defineConfig({
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
    target: "esnext",
  },
  server: {
    port: 3000,
    open: false,
  },
});
