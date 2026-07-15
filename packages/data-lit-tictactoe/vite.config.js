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
  build: { outDir: "dist" },
  server: { port: 3003, open: false },
});
