// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
    {
        test: {
            name: "node",
            environment: "node",
            include: ["src/**/*.test.ts"],
            exclude: ["**/node_modules/**", "**/dist/**"],
            silent: false,
            reporters: "verbose",
        },
    },
]);
