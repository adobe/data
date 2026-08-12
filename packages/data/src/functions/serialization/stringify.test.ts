// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from 'vitest';
import { Data } from '../../data.js';

describe('Data.stringify / Data.parse', () => {
    it('round-trips plain JSON values', () => {
        const original = {
            s: 'hello',
            n: 42,
            b: true,
            nil: null,
            arr: [1, 'two', false, null],
            nested: { a: 1, b: [2, 3] },
        };
        const roundTrip = Data.parse<typeof original>(Data.stringify(original));
        expect(roundTrip).toEqual(original);
    });

    it('round-trips a Map with string keys', () => {
        const original = new Map([['a', 1], ['b', 2]]);
        const roundTrip = Data.parse<Map<string, number>>(Data.stringify(original));
        expect(roundTrip).toBeInstanceOf(Map);
        expect(roundTrip).toEqual(original);
    });

    it('round-trips a Map with non-string keys', () => {
        const original = new Map<unknown, string>([
            [1, 'one'],
            [{ x: 1 }, 'obj'],
        ]);
        const roundTrip = Data.parse<Map<unknown, string>>(Data.stringify(original));
        expect(roundTrip).toBeInstanceOf(Map);
        expect([...roundTrip.entries()]).toEqual([[1, 'one'], [{ x: 1 }, 'obj']]);
    });

    it('round-trips a Set', () => {
        const original = new Set([1, 2, 3]);
        const roundTrip = Data.parse<Set<number>>(Data.stringify(original));
        expect(roundTrip).toBeInstanceOf(Set);
        expect(roundTrip).toEqual(original);
    });

    it('round-trips nested and interleaved Map/Set inside plain objects', () => {
        const original = {
            counts: new Map<string, Set<number>>([
                ['evens', new Set([2, 4])],
                ['odds', new Set([1, 3])],
            ]),
            tags: new Set(['a', 'b']),
            list: [new Map([['k', 'v']])],
        };
        const roundTrip = Data.parse<typeof original>(Data.stringify(original));
        expect(roundTrip).toEqual(original);
        expect(roundTrip.counts).toBeInstanceOf(Map);
        expect(roundTrip.counts.get('evens')).toBeInstanceOf(Set);
        expect(roundTrip.tags).toBeInstanceOf(Set);
        expect(roundTrip.list[0]).toBeInstanceOf(Map);
    });

    it('applies an optional replacer/reviver around the Map/Set transform', () => {
        const original = { big: 9007199254740993n, items: new Set([1n]) };
        const json = Data.stringify(original, (_key, value) =>
            typeof value === 'bigint' ? { __bigint: value.toString() } : value,
        );
        const roundTrip = Data.parse<typeof original>(json, (_key, value) =>
            value && typeof value === 'object' && '__bigint' in value
                ? BigInt(value.__bigint)
                : value,
        );
        expect(roundTrip.big).toBe(9007199254740993n);
        expect(roundTrip.items).toBeInstanceOf(Set);
        expect(roundTrip.items).toEqual(new Set([1n]));
    });
});
