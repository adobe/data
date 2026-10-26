// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { defineConfig } from "vitest/config";

// `*.test.ts` in node. A test's timeout only guards against a hang, which no test asserts on.
export default defineConfig({
    plugins: [Compiler.plugin()],
    test: { include: ["src/**/*.test.ts"], testTimeout: 30000, hookTimeout: 30000 },
});
