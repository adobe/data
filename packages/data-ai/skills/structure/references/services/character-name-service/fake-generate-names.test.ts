import { describe, expect, it } from "vitest";
import { fakeGenerateNames } from "./fake-generate-names.js";

describe("fakeGenerateNames", () => {
  it("caps batch size and uses style-specific parts", () => {
    expect(fakeGenerateNames({ count: 99, style: "modern", seed: 3 })).toHaveLength(16);
    expect(fakeGenerateNames({ count: 1, style: "modern", seed: 3 })[0]?.value).toBe("Morgan Shaw");
  });
});
