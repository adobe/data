// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { defineConfig } from "vitest/config";

// Persistence needs no browser: every test runs in node.
export default defineConfig({
    plugins: [Compiler.plugin()],
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
    },
});
