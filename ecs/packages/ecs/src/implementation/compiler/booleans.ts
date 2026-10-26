// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Expression, Statement } from './ir.js';
import { references } from './ir.js';
import type { Unit } from './unit.js';

/**
 * Column reads print as plain `c{k}[i]`, since a 0/1 number behaves like a boolean in most positions. Where a
 * boolean's identity is observable (`===`, `!==`, command values) reads convert, along with every local whose
 * value flows there.
 */
const observeLocals = (unit: Unit, expression: Expression): void => {
    references(expression, node => {
        if (node.kind === "local" && !unit.observed.has(node.local)) {
            unit.observed.add(node.local);
            for (const source of unit.assignments.get(node.local) ?? []) observeLocals(unit, source);
        }
        return false;
    });
};

/** Marks a value for an observable position. */
export const observe = (unit: Unit, value: Expression): Expression => {
    observeLocals(unit, value);
    return { kind: "observe", value };
};

/** Records an assignment, so observing the local later also observes its sources. */
export const record = (unit: Unit, local: number, value: Expression): void => {
    const assigned = unit.assignments.get(local) ?? [];
    assigned.push(value);
    unit.assignments.set(local, assigned);
    if (unit.observed.has(local)) observeLocals(unit, value);
};

/** `local = value`, recorded. */
export const set = (unit: Unit, local: number, value: Expression, declare: "const" | "let" | undefined): Statement => {
    record(unit, local, value);
    return { kind: "set", local, value, declare };
};
