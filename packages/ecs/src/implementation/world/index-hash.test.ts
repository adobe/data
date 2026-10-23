// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { bucketFor, coverEntities, createHashTable, entryWords, insertEntry, lengthOf, removeEntry, sortBucket, startOf } from "./index-hash.js";
import { hashWords } from "./index-keys.js";
import { createMemory } from "./memory.js";

describe("a hash table's unsorted buckets", () => {
    it("are listed once each, however often one is sorted and left unsorted again while another stays unsorted", () => {
        const table = createHashTable(createMemory(), 1);
        coverEntities(table, 400);
        const key = new Uint32Array(1);
        const bucketOf = (value: number): number => {
            key[0] = value;
            return bucketFor(table, key, 0, hashWords(key, 0, 1), 0);
        };
        const buckets = [bucketOf(0), bucketOf(1)];
        for (let entity = 1; entity <= 300; entity++) insertEntry(table, buckets[entity % 2], entity, 0, entity, 0, true);
        // One entity leaves the first bucket once: it stays unsorted.
        removeEntry(table, buckets[0], 2, 1, true);
        let out = false;
        for (let run = 0; run < 500; run++) {
            // An entity of the second bucket leaves it or comes back, and a read by position sorts it.
            if (out) insertEntry(table, buckets[1], 151, 0, 151, run, true);
            else removeEntry(table, buckets[1], 151, run, true);
            out = !out;
            if (table.tails[buckets[1]] >= 0) sortBucket(table, buckets[1]);
        }
        expect(table.unsortedListed).toBeLessThanOrEqual(2);
        sortBucket(table, buckets[0]);
        const entities = (bucket: number): number[] => Array.from({ length: lengthOf(table, bucket) }, (_, k) => table.entries[(startOf(table, bucket) + k) * entryWords]);
        expect(entities(buckets[0])).toEqual(Array.from({ length: 149 }, (_, k) => 2 * k + 4));
        expect(entities(buckets[1])).toEqual(Array.from({ length: 150 }, (_, k) => 2 * k + 1));
    });
});
