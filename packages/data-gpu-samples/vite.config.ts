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
  // In production (GitHub Pages) the app lives at /data/gpu-samples/, its `pages` target.
  // The dev server ignores this — it always serves from /.
  base: process.env.CI ? "/data/gpu-samples/" : "/",
  build: { outDir: "dist" },
  server: { port: 3008, open: false },
});
