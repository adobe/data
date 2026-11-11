// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SyncSystem } from '../../interface/system/sync-system.js';
import { firstItemOf, firstKeyOf, labelOf, threadOf } from '../../interface/registry/index.js';

/** The thread a sync system runs on: a changes system, and a removed system using no objects, on the world's. */
const runsOn = (syncSystem: SyncSystem): string => syncSystem.kind === "removed" ? threadOf(syncSystem.declaration, "Removed system", syncSystem.name) ?? "world" : "world";

/**
 * A world's changes and removed systems, `runners` in the order they were added, in run order: `before` and `after`
 * first, then the order added. Throws for a cycle, for two ordered with each other that run on different threads,
 * and for two that both write a resource, or where one reads what the other writes, with no ordering between them.
 */
export const orderSyncSystems = (runners: readonly SyncSystem[]): SyncSystem[] => {
    const indexOf = new Map<object, number>(runners.map((runner, index) => [firstItemOf(runner), index]));
    const successors = runners.map(() => new Set<number>());
    const threads = runners.map(runsOn);
    /** Throws for two ordered with each other on different threads, which run at different times. */
    const sameThread = (index: number, other: number): void => {
        if (threads[index] === threads[other]) return;
        throw new Error(`System "${runners[index].name}" runs on thread "${threads[index]}" and is ordered with "${runners[other].name}", which runs on thread "${threads[other]}"; changes and removed systems on different threads run at different times, so neither is ordered before the other.`);
    };
    runners.forEach((runner, index) => {
        const { before, after } = runner.declaration;
        for (const syncSystem of before ?? []) {
            const other = indexOf.get(firstItemOf(syncSystem));
            if (other === undefined) continue;
            sameThread(index, other);
            successors[index].add(other);
        }
        for (const syncSystem of after ?? []) {
            const other = indexOf.get(firstItemOf(syncSystem));
            if (other === undefined) continue;
            sameThread(index, other);
            successors[other].add(index);
        }
    });
    const incoming = runners.map(() => 0);
    for (const next of successors) for (const other of next) incoming[other]++;
    const order: number[] = [];
    const ready = runners.flatMap((_, index) => incoming[index] === 0 ? [index] : []);
    while (ready.length > 0) {
        ready.sort((a, b) => a - b);
        const index = ready.shift() ?? 0;
        order.push(index);
        for (const other of successors[index]) if (--incoming[other] === 0) ready.push(other);
    }
    if (order.length < runners.length) {
        const cycle = runners.filter((_, index) => !order.includes(index)).map(runner => `"${runner.name}"`).join(", ");
        throw new Error(`Systems ${cycle} are ordered in a cycle.`);
    }
    const reaches = (from: number, to: number): boolean => {
        const seen = new Set<number>();
        const stack = [from];
        while (stack.length > 0) {
            const next = stack.pop() ?? 0;
            if (next === to) return true;
            if (seen.has(next)) continue;
            seen.add(next);
            stack.push(...successors[next]);
        }
        return false;
    };
    const writes = runners.map(runner => new Set<unknown>((runner.declaration.resources?.write ?? []).map(firstKeyOf)));
    const reads = runners.map(runner => new Set<unknown>((runner.declaration.resources?.read ?? []).map(firstKeyOf)));
    for (let a = 0; a < runners.length; a++) for (let b = a + 1; b < runners.length; b++) {
        const conflict = [...writes[a]].find(key => writes[b].has(key) || reads[b].has(key)) ?? [...writes[b]].find(key => reads[a].has(key));
        if (conflict !== undefined && !reaches(a, b) && !reaches(b, a)) {
            throw new Error(`Systems "${runners[a].name}" and "${runners[b].name}" both access "${labelOf(conflict)}", one writing it; order them with before or after.`);
        }
    }
    return order.map(index => runners[index]);
};
