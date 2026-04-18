import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  root: ".",
  build: { outDir: "dist" },
  server: { port: 3004, open: false },
});
