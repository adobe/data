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
  // In production (GitHub Pages) the app lives at /data/graphics-samples/.
  // The dev server ignores this — it always serves from /.
  base: process.env.CI ? "/data/graphics-samples/" : "/",
  build: { outDir: "dist" },
  server: { port: 3008, open: false },
});
