import type { Path } from '../world/create/kernel.js';
import type { Expression } from './ir.js';
import type { Unit } from './unit.js';

const column = (unit: Unit, identity: string, description: string): number => {
    const existing = unit.columnIndex.get(identity);
    if (existing !== undefined) return existing;
    unit.columns.push(description);
    unit.columnIndex.set(identity, unit.columns.length - 1);
    return unit.columns.length - 1;
};

/** The column of a scalar leaf of a component. */
export const fieldColumn = (unit: Unit, component: string, path: Path): number => {
    const json = JSON.stringify(path);
    return column(unit, `field ${component} ${json}`, `{ kind: "field", component: ${component}, path: ${json} }`);
};

export const fieldRead = (unit: Unit, component: string, path: Path): Expression => ({ kind: "column", column: fieldColumn(unit, component, path) });

export const changedColumn = (unit: Unit, component: string): number =>
    column(unit, `changed ${component}`, `{ kind: "changed", component: ${component} }`);

export const entityRead = (unit: Unit): Expression => ({ kind: "column", column: column(unit, "entity", `{ kind: "entity" }`) });
