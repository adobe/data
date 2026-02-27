import { defineConfig } from "vite";

export default defineConfig({
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
