import { describe, expect, it } from "vitest";
import { massFromVolume } from "./mass-from-volume.js";

describe("massFromVolume", () => {
    it("multiplies volume by density", () => {
        expect(massFromVolume(2, 1000)).toBe(2000);
    });
});
