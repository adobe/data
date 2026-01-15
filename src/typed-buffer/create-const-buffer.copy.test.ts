// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createConstBuffer } from "./create-const-buffer.js";

describe("createConstBuffer.copy", () => {
    it("should produce a new buffer with same capacity and const semantics", () => {
        const buf = createConstBuffer({ const: 7 }, 5);
        const copy = buf.copy();
        
        expect(copy.capacity).toBe(5);
        expect(copy.type).toBe("const");
        
        // Verify all elements return the const value
        for (let i = 0; i < 5; i++) {
            expect(copy.get(i)).toBe(7);
        }
    });
});


