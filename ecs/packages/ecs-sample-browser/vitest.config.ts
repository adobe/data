// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineConfig } from "vitest/config";

// `*.test.ts` in node, in this package alone: its vite configuration serves the folder of packages. A test's timeout
// only guards against a hang.
export default defineConfig({
    test: { include: ["*.test.ts"], testTimeout: 60000, hookTimeout: 180000 },
});
