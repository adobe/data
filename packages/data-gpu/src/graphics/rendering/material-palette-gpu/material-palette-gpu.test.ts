import { describe, expect, it } from "vitest";
import { materialHasMaps } from "./material-palette.js";

const emptyUrls = {
    baseColorUrl: "",
    metallicRoughnessUrl: "",
    normalUrl: "",
    occlusionUrl: "",
    emissiveUrl: "",
};

describe("materialHasMaps", () => {
    it("is false when all URLs are empty", () => {
        expect(materialHasMaps(emptyUrls)).toBe(false);
    });

    it("is true when any URL is set", () => {
        expect(materialHasMaps({ ...emptyUrls, baseColorUrl: "https://example.com/a.jpg" })).toBe(true);
    });
});
