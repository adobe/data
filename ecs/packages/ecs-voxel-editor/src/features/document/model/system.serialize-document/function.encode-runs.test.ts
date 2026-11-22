// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { decodeRuns } from "../internal/function.decode-runs.js";
import { encodeRuns } from "./function.encode-runs.js";

it("encodes cells as runs of materials by name, and decodes them back", () => {
    const filled = new Map([["0,0,0", "stone"], ["1,0,0", "stone"], ["0,1,1", "wood"]]);
    const encoded = encodeRuns([2, 2, 2], (x, y, z) => filled.get(`${x},${y},${z}`) ?? null);
    expect(encoded).toEqual({ palette: ["stone", "wood"], runs: [2, 1, 4, 0, 1, 2, 1, 0] });
    const decoded = new Map<string, string>();
    decodeRuns([2, 2, 2], encoded, (x, y, z, name) => decoded.set(`${x},${y},${z}`, name));
    expect(decoded).toEqual(filled);
});
