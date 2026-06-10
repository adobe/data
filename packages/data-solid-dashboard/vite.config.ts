import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import checker from "vite-plugin-checker";

export default defineConfig({
  plugins: [solid(), checker({ typescript: true })],
  root: ".",
  build: { outDir: "dist" },
  server: { port: 3004, open: false },
});
