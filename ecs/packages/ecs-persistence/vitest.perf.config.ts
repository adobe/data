// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { defineConfig } from "vitest/config";

// The benchmarks, in node: each prints its timings and asserts nothing about them.
export default defineConfig({
    plugins: [Compiler.plugin()],
    test: {
        include: ["perf/**/*.perf.ts"],
        environment: "node",
        testTimeout: 600000,
    },
});
