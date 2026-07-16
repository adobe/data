// © 2026 Adobe. MIT License. See /LICENSE for details.

import { getCached } from "./get-cached.js";
import { cached } from "./cached.js";
import { describe, expect, it } from "vitest";

describe("cached", () => {
    it("should cache values on objects", () => {
        const obj = { id: 1 };
        let factoryCallCount = 0;

        const compute = cached((o: typeof obj) => {
            factoryCallCount++;
            return { computed: o.id * 2 };
        });

        const result1 = compute(obj);
        expect(result1).toEqual({ computed: 2 });
        expect(factoryCallCount).toBe(1);

        const result2 = compute(obj);
        expect(result2).toEqual({ computed: 2 });
        expect(factoryCallCount).toBe(1);
    });

    it("should cache different values for different objects", () => {
        const obj1 = { id: 1 };
        const obj2 = { id: 2 };
        let factoryCallCount = 0;

        const compute = cached((o: typeof obj1) => {
            factoryCallCount++;
            return { computed: o.id * 2 };
        });

        const result1 = compute(obj1);
        expect(result1).toEqual({ computed: 2 });
        expect(factoryCallCount).toBe(1);

        const result2 = compute(obj2);
        expect(result2).toEqual({ computed: 4 });
        expect(factoryCallCount).toBe(2);
    });

    it("should share cache with getCached for the same factory", () => {
        const obj = { id: 1 };
        let factoryCallCount = 0;

        const factory = (o: typeof obj) => {
            factoryCallCount++;
            return { computed: o.id * 2 };
        };

        const compute = cached(factory);

        getCached(obj, factory);
        expect(factoryCallCount).toBe(1);

        compute(obj);
        expect(factoryCallCount).toBe(1);
    });
});
