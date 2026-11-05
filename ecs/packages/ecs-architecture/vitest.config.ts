// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
    // `#parser` resolves to the sources under the `ecs-architecture-source` condition, as TypeScript resolves it.
    ssr: { resolve: { conditions: ["ecs-architecture-source", ...defaultServerConditions] } },
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
        // A test's timeout only guards against a hang, which no test asserts on: long enough for a machine busy elsewhere.
        testTimeout: 30000,
    },
});
