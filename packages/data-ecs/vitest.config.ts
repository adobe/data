import { defineConfig } from "vite";
import { kernelPlugin } from "./src/implementation/compiler/index.ts";

export default defineConfig({ plugins: [kernelPlugin()] });
