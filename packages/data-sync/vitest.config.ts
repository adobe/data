// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        silent: false,
        reporters: "verbose",
        projects: [
            {
                test: {
                    name: "node",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["**/node_modules/**", "**/dist/**"],
                },
            },
        ],
    },
});
