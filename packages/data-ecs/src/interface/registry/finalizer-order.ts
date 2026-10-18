import type { Finalizer } from '../finalizer/created.js';
import { firstKeyOf, labelOf } from './names.js';

/**
 * Finalizers in run order: `before` and `after` first, then registration order. Throws for a cycle, and for two that
 * both write a resource, or where one reads what the other writes, with no ordering between them.
 */
export const orderFinalizers = <T extends { readonly name: string; readonly finalizer: Finalizer }>(runners: readonly T[]): T[] => {
    const indexByName = new Map(runners.map((runner, index) => [runner.name, index]));
    const successors = runners.map(() => new Set<number>());
    runners.forEach((runner, index) => {
        const { before, after } = runner.finalizer.declaration;
        for (const { name } of before ?? []) { const other = indexByName.get(name); if (other !== undefined) successors[index].add(other); }
        for (const { name } of after ?? []) { const other = indexByName.get(name); if (other !== undefined) successors[other].add(index); }
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
        throw new Error(`Finalizers ${cycle} are ordered in a cycle.`);
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
    const writes = runners.map(runner => new Set<unknown>((runner.finalizer.declaration.resources?.write ?? []).map(firstKeyOf)));
    const reads = runners.map(runner => new Set<unknown>((runner.finalizer.declaration.resources?.read ?? []).map(firstKeyOf)));
    for (let a = 0; a < runners.length; a++) for (let b = a + 1; b < runners.length; b++) {
        const conflict = [...writes[a]].find(key => writes[b].has(key) || reads[b].has(key)) ?? [...writes[b]].find(key => reads[a].has(key));
        if (conflict !== undefined && !reaches(a, b) && !reaches(b, a)) {
            throw new Error(`Finalizers "${runners[a].name}" and "${runners[b].name}" both access "${labelOf(conflict)}", one writing it; order them with before or after.`);
        }
    }
    return order.map(index => runners[index]);
};
