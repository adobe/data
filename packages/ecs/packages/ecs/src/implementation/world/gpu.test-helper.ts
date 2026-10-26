// © 2026 Adobe. MIT License. See /LICENSE for details.
import { inject } from "vitest";

declare module "vitest" {
    interface ProvidedContext {
        /** Whether this run has a GPU: tests that need one skip without it, as on CI's runners (`vitest.config.ts`). */
        readonly gpu: boolean;
    }
}

/** Whether this run has a GPU, for `it.runIf(gpu)`. */
export const gpu = inject("gpu");
