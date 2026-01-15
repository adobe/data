// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, test, expect } from "vitest";
import { withFilter } from "./with-filter.js";
import { fromConstant } from "./from-constant.js";

describe("withFilter", () => {
    test("should filter out undefined values", () => {
        const observable = fromConstant(5);
        const filtered = withFilter(observable, (value) =>
            value > 3 ? value * 2 : undefined
        );

        let result: number | undefined;
        filtered((value) => {
            result = value;
        })();

        expect(result).toBe(10);
    });

    test("should filter out all values when filter returns undefined", () => {
        const observable = fromConstant(5);
        const filtered = withFilter(observable, () => undefined);

        let called = false;
        filtered(() => {
            called = true;
        })();

        expect(called).toBe(false);
    });

    test("should pass through values when filter returns non-undefined", () => {
        const observable = fromConstant("hello");
        const filtered = withFilter(observable, (value) =>
            value.length > 3 ? value.toUpperCase() : undefined
        );

        let result: string | undefined;
        filtered((value) => {
            result = value;
        })();

        expect(result).toBe("HELLO");
    });

    test("should handle mixed filtering in sequence", () => {
        const values: number[] = [];
        const observable = (observer: (value: number) => void) => {
            observer(1);
            observer(2);
            observer(3);
            observer(4);
            observer(5);
            return () => { };
        };

        const filtered = withFilter(observable, (value) =>
            value % 2 === 0 ? value * 2 : undefined
        );

        filtered((value) => {
            values.push(value);
        })();

        expect(values).toEqual([4, 8]);
    });
}); 