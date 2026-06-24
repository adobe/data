// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { withDeduplicateData } from './with-deduplicate-data.js';
import { Observe } from './index.js';

describe('withDeduplicateData', () => {
    it('should emit first value', () => {
        const source: Observe<number> = (observer) => {
            observer(1);
            return () => {};
        };
        const values: number[] = [];
        withDeduplicateData(source)((v) => values.push(v));
        expect(values).toEqual([1]);
    });

    it('should deduplicate consecutive equal values', () => {
        const source: Observe<number> = (observer) => {
            observer(1);
            observer(1);
            observer(2);
            observer(2);
            return () => {};
        };
        const values: number[] = [];
        withDeduplicateData(source)((v) => values.push(v));
        expect(values).toEqual([1, 2]);
    });

    // Defensive: T extends Data excludes undefined at compile time, but runtime
    // guards should hold even if undefined arrives via any/generics.
    it('should deduplicate consecutive undefined values (defensive)', () => {
        const source = ((observer: (v: null) => void) => {
            (observer as (v: unknown) => void)(undefined);
            (observer as (v: unknown) => void)(undefined);
            return () => {};
        }) satisfies Observe<null>;

        const values: (null | undefined)[] = [];
        withDeduplicateData(source)((v: any) => values.push(v));
        expect(values).toEqual([undefined]);
    });
});
