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

/** A component's changed column, immediately followed by its dense chunk column. */
export const changedColumns = (unit: Unit, component: string): { readonly column: number; readonly chunks: number } => {
    const changed = column(unit, `changed ${component}`, `{ kind: "changed", component: ${component} }`);
    const chunks = column(unit, `chunks ${component}`, `{ kind: "chunks", component: ${component} }`);
    unit.chunks.add(chunks);
    return { column: changed, chunks };
};

export const entityRead = (unit: Unit): Expression => ({ kind: "column", column: column(unit, "entity", `{ kind: "entity" }`) });
