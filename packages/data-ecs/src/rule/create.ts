import type { Declaration } from './declaration.js';
import type { Rule } from './rule.js';

/** Declares a rule. Returns it as data; nothing runs. */
export const create = <const D extends Declaration>(declaration: D): Rule<D> => ({ declaration });
