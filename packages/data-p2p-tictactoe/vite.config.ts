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
  // In production (GitHub Pages) the app lives at /data/p2p-tictactoe/.
  // The dev server ignores this — it always serves from /.
  base: process.env.CI ? "/data/p2p-tictactoe/" : "/",
  build: { outDir: "dist" },
  server: { port: 3007, open: false },
});
