import type { Path } from '../world/create/kernel.js';
import { readMarker } from './booleans.js';
import type { Unit } from './unit.js';

const column = (unit: Unit, identity: string, description: string): number => {
    const existing = unit.columnIndex.get(identity);
    if (existing !== undefined) return existing;
    unit.columns.push(description);
    unit.columnIndex.set(identity, unit.columns.length - 1);
    return unit.columns.length - 1;
};

const field = (unit: Unit, component: string, path: Path): number => {
    const json = JSON.stringify(path);
    return column(unit, `field ${component} ${json}`, `{ kind: "field", component: ${component}, path: ${json} }`);
};

/** The store target for a scalar leaf of a component in row `i`. */
export const fieldTarget = (unit: Unit, component: string, path: Path): string => `c${field(unit, component, path)}[i]`;

/** Reads a scalar leaf of a component in row `i`, as a marker that `booleans.ts` renders. */
export const fieldRead = (unit: Unit, component: string, path: Path): string => readMarker(field(unit, component, path));

export const changedTarget = (unit: Unit, component: string): string =>
    `c${column(unit, `changed ${component}`, `{ kind: "changed", component: ${component} }`)}[i]`;

export const entityRead = (unit: Unit): string => `c${column(unit, "entity", `{ kind: "entity" }`)}[i]`;
