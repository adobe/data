import { declarationOf, kindOf, labelOf } from '../registry/names.js';
import { addRule } from '../registry/program.js';
import type { Rule } from './created.js';
import type { Declaration } from './declaration.js';

/**
 * Declares a rule, which applies in every world. Throws if a system, rule or finalizer has its name, it matches on a
 * name that isn't a registered component, or derives a component that isn't derived.
 */
export const create = <const D extends Declaration>(declaration: D): void => {
    const { name, components, derive } = declaration;
    for (const key of [...components.has ?? [], ...components.not ?? [], ...derive]) {
        if (kindOf(key) !== "component") throw new Error(`Rule "${name}" uses "${labelOf(key)}", which isn't a registered component.`);
    }
    for (const key of derive) {
        if (declarationOf(key)?.derived !== true) throw new Error(`Rule "${name}" derives "${labelOf(key)}", which isn't declared derived.`);
    }
    const rule: Rule<D> = { kind: "rule", declaration };
    addRule(rule);
};
