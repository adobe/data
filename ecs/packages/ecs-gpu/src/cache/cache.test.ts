// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { gpu, testDevice } from "../gpu.test-helper.js";
import { perDevice } from "./cache.js";

describe("caches per device", () => {
    it.runIf(gpu)("make a value once per device and key", async () => {
        const [first, second] = [await testDevice(), await testDevice()];
        let made = 0;
        const samplers = perDevice((device: GPUDevice, filter: GPUFilterMode) => {
            made++;
            return device.createSampler({ magFilter: filter });
        });
        const linear = samplers(first, "linear");
        expect(samplers(first, "linear")).toBe(linear);
        expect(samplers(first, "nearest")).not.toBe(linear);
        expect(samplers(second, "linear")).not.toBe(linear);
        expect(made).toBe(3);
    });
});
