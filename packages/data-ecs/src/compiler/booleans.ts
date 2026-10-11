import type { Unit } from './unit.js';

/**
 * Field reads are emitted as markers. Most positions render them as plain `c{k}[i]`, since a 0/1 number behaves
 * like a boolean there. Positions where a boolean's identity is observable (`===`, `!==`, command values) convert
 * them, along with every local whose value flows there.
 */
export const readMarker = (column: number): string => `\u0001${column}\u0002`;

const markers = /\u0001(\d+)\u0002/g;
const names = /[A-Za-z_$][\w$]*/g;

/** Renders remaining markers as plain reads. */
export const plainReads = (code: string): string => code.replace(markers, "c$1[i]");

const convertReads = (unit: Unit, code: string): string => code.replace(markers, (_, column: string) => {
    unit.booleans.add(Number(column));
    return `(b${column} ? c${column}[i] !== 0 : c${column}[i])`;
});

const observeNames = (unit: Unit, code: string): void => {
    for (const name of code.match(names) ?? []) {
        const assigned = unit.assignments.get(name);
        if (assigned === undefined || unit.observed.has(name)) continue;
        unit.observed.add(name);
        for (const source of assigned) observeNames(unit, source);
    }
};

/** Code for an observable position: reads in it, and in the locals it uses, yield real booleans. */
export const observe = (unit: Unit, code: string): string => {
    observeNames(unit, code);
    return convertReads(unit, code);
};

/** Records `name = code`, rendered with conversion if `name` is ever observed. */
export const assignment = (unit: Unit, prefix: string, name: string, code: string): (() => string) => {
    const assigned = unit.assignments.get(name) ?? [];
    assigned.push(code);
    unit.assignments.set(name, assigned);
    if (unit.observed.has(name)) observeNames(unit, code);
    return () => `${prefix}${name} = ${unit.observed.has(name) ? convertReads(unit, code) : code};`;
};

/** Like `assignment`, for one declarator in a multi-declarator line. */
export const declarator = (unit: Unit, name: string, code: string): (() => string) => {
    const render = assignment(unit, "", name, code);
    return () => render().slice(0, -1);
};
