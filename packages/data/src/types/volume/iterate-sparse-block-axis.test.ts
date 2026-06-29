// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { packPlaneKey } from "./create-sparse-block/pack-block-key.js";

describe("packPlaneKey", () => {
    it("round-trips two slice coordinates in sort order", () => {
        const a = packPlaneKey(-1, 2);
        const b = packPlaneKey(-1, 3);
        expect(a).toBeLessThan(b);
    });
});
