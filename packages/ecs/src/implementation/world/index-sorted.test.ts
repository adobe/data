import { describe, expect, it } from "vitest";
import { blockAt, blockBase, coverSortedEntities, createSortedTable, firstPosition, insertSorted, removeSorted, stampWatched, treeMaximum, watchSortedComponent, type SortedTable } from "./index-sorted.js";
import { createMemory } from "./memory.js";

/** Whether every derived array matches the blocks: positions, fences, the Fenwick tree and the segment trees. */
const consistent = (table: SortedTable): string | null => {
    let position = 0;
    for (let k = 0; k < table.blocks; k++) {
        const block = table.order[k];
        if (table.positions[block] !== k) return `position of block ${block}`;
        if (firstPosition(table, k) !== position) return `first position at ${k}`;
        const length = table.lengths[block];
        if (length === 0) return `empty block at ${k}`;
        if (table.fences[k * (table.words + 1) + table.words] !== table.entries[blockBase(table, block) + (length - 1) * table.stride + table.words]) return `fence at ${k}`;
        for (let e = 0; e < length; e++) if (blockAt(table, position + e) !== k) return `block at ${position + e}`;
        if (treeMaximum(table, table.tree, k, k) !== table.ticks[block]) return `tick at ${k}`;
        for (const watch of table.watched.values()) if (treeMaximum(table, watch.tree, k, k) !== watch.ticks[block]) return `watched tick at ${k}`;
        position += length;
    }
    if (position !== table.size) return "size";
    let newest = 0;
    for (let k = 0; k < table.blocks; k++) newest = Math.max(newest, table.ticks[table.order[k]]);
    if (table.blocks > 0 && table.tree[1] !== newest) return "root";
    return null;
};

/** The entity indexes in order. */
const listed = (table: SortedTable): number[] => {
    const found: number[] = [];
    for (let k = 0; k < table.blocks; k++) {
        const block = table.order[k];
        for (let e = 0; e < table.lengths[block]; e++) found.push(table.entries[blockBase(table, block) + e * table.stride + table.words]);
    }
    return found;
};

describe("a sorted table without key words", () => {
    it("keeps its positions, fences and trees as blocks split and drop anywhere in the order", () => {
        const table = createSortedTable(createMemory(), 0, []);
        coverSortedEntities(table, 10000);
        watchSortedComponent(table, 7, 0);
        const key = new Uint32Array(1);
        const held = new Set<number>();
        let state = 12345;
        const next = (): number => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 2 ** 32;
        };
        for (let tick = 1; tick <= 400; tick++) {
            // Bursts at the end, in the middle and at the start: scattered insertions, and removals of a run, which empty blocks.
            const from = Math.floor(next() * 3) * 3000;
            if (next() < 0.6) {
                for (let k = 0; k < 300; k++) {
                    const entity = 1 + from + Math.floor(next() * 3000);
                    if (held.has(entity)) continue;
                    insertSorted(table, key, 0, [], entity, 0, entity, tick);
                    held.add(entity);
                }
            }
            else {
                const start = 1 + from + Math.floor(next() * 2600);
                for (let entity = start; entity < start + 400; entity++) {
                    if (!held.has(entity)) continue;
                    removeSorted(table, entity, tick);
                    held.delete(entity);
                }
            }
            // A watched value changed in some block.
            stampWatched(table, 7, Math.floor(next() * table.blocks), tick);
            expect(consistent(table)).toBeNull();
        }
        expect(listed(table)).toEqual([...held].sort((a, b) => a - b));
        expect(table.blocks).toBeGreaterThan(20);
    });
});
