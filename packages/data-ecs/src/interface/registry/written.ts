import { clock } from '../resources/clock.js';
import { report } from '../resources/report.js';
import { labelOf } from './names.js';

/** Resources only the world writes. */
const worldWritten: ReadonlySet<symbol> = new Set([clock, report]);

/** Throws if `writes` lists a resource only the world writes. */
export const checkWorldWritten = (what: string, writes: readonly (symbol)[] | undefined): void => {
    const found = writes?.find(key => worldWritten.has(key));
    if (found !== undefined) throw new Error(`${what} writes "${labelOf(found)}", which only the world writes.`);
};

/** Whether only the world writes a resource. */
export const isWorldWritten = (key: symbol): boolean => worldWritten.has(key);
