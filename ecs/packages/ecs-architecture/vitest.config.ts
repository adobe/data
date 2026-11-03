// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
        // A test's timeout only guards against a hang, which no test asserts on: long enough for a machine busy elsewhere.
        testTimeout: 30000,
    },
});
