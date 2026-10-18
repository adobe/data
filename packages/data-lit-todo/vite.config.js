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
  build: { outDir: "dist" },
  server: { port: 3004, open: false },
});
