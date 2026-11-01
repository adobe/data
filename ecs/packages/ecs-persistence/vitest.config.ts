// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { defineConfig } from "vitest/config";

// Persistence needs no browser: every test runs in node.
export default defineConfig({
    plugins: [Compiler.plugin()],
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
        // A test's timeout only guards against a hang, which no test asserts on: long enough for a machine busy elsewhere.
        testTimeout: 30000,
        hookTimeout: 30000,
    },
});
