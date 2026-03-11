import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

export default defineConfig({
  plugins: [checker({ typescript: true })],
  root: ".",
  build: { outDir: "dist" },
  server: { port: 3003, open: false },
});
