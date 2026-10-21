import { declarationOf, kindOf, labelOf } from '../registry/names.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { nameOf } from '../registry/items.js';
import { addRule } from '../registry/program.js';
import type { Rule as Created } from './created.js';
import type { Declaration } from './declaration.js';

/**
 * Declares a rule, which applies in every world, and returns it: identified by that value, labeled by its name. Throws
 * if it matches on a key that isn't a registered component, derives a component that isn't derived, or derives in a
 * cycle through a negation.
 */
export const create = <const D extends Declaration>(declaration: D): { readonly name: string } => {
    const id = takeIdOfDeclaration(declaration);
    const name = nameOf(declaration.name, id, "rule");
    const { components, derive } = declaration;
    for (const key of [...components.has ?? [], ...components.not ?? [], ...derive]) {
        if (kindOf(key) !== "component") throw new Error(`Rule "${name}" uses "${labelOf(key)}", which isn't a registered component.`);
    }
    for (const key of derive) {
        if (declarationOf(key)?.derived !== true) throw new Error(`Rule "${name}" derives "${labelOf(key)}", which isn't declared derived.`);
    }
    const rule: Created<D> = { kind: "rule", name, declaration };
    return addRule(rule, id);
};
