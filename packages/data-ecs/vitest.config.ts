import { defineConfig } from "vite";
import { kernelPlugin } from "./src/compiler/index.ts";

export default defineConfig({ plugins: [kernelPlugin()] });
