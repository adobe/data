import { addRule } from '../world/create/program.js';
import type { Declaration } from './declaration.js';
import type { Rule } from './rule.js';

/**
 * Declares a rule, which applies in every world. Returns it as data. Throws if a different system, rule or finalizer
 * has its name, it derives a component that isn't derived, matches on a resource, or the program's rules cycle
 * through a negation.
 */
export const create = <const D extends Declaration>(declaration: D): Rule<D> => {
    const rule: Rule<D> = { kind: "rule", declaration };
    addRule(rule);
    return rule;
};
