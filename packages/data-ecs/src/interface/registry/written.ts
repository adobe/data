import { threadClaims } from '../components/thread-claims.js';
import { threadStatus } from '../components/thread-status.js';
import { clock } from '../resources/clock.js';
import { report } from '../resources/report.js';
import { labelOf } from './names.js';

/** Resources and components only the world writes. */
const worldWritten: ReadonlySet<symbol> = new Set([clock, report, threadClaims, threadStatus]);

/** Throws if `writes` lists a resource or component only the world writes. */
export const checkWorldWritten = (what: string, writes: readonly (symbol)[] | undefined): void => {
    const found = writes?.find(key => worldWritten.has(key));
    if (found !== undefined) throw new Error(`${what} writes "${labelOf(found)}", which only the world writes.`);
};

/** Whether only the world writes a resource or component. */
export const isWorldWritten = (key: symbol): boolean => worldWritten.has(key);
