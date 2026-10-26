// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationOf, kindOf, labelOf, whyUnregistered } from '../registry/names.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { nameOf } from '../registry/items.js';
import { addRule } from '../registry/program.js';
import type { Rule as Created } from './created.js';
import type { Declaration } from './declaration.js';

/**
 * Declares a rule, which applies in every world, and returns it: identified by that value, labeled by its binding. Throws
 * if it matches on a key that isn't a registered component, derives a component that isn't derived, or derives in a
 * cycle through a negation.
 */
export const create = <const D extends Declaration>(declaration: D & { readonly components: { readonly has?: never } }): { readonly name: string } => {
    const id = takeIdOfDeclaration(declaration);
    const name = nameOf(declaration, id, "rule");
    const { derive } = declaration;
    const components = { has: declaration.components.with, not: declaration.components.not };
    for (const key of [...components.has ?? [], ...components.not ?? [], ...derive]) {
        if (kindOf(key) !== "component") throw new Error(`Rule "${name}" uses "${labelOf(key)}", which isn't a registered component: ${whyUnregistered(key)}.`);
    }
    for (const key of derive) {
        if (declarationOf(key)?.derived !== true) throw new Error(`Rule "${name}" derives "${labelOf(key)}", which isn't declared derived.`);
    }
    const rule: Created = { kind: "rule", name, declaration: { ...declaration, components } };
    return addRule(rule, id);
};
