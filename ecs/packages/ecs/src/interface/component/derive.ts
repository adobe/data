// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationOf, kindOf, labelOf, whyUnregistered } from '../registry/names.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { nameOf } from '../registry/items.js';
import { addRule } from '../registry/rules.js';
import type { Key } from './key.js';
import type { Derived } from './value.js';
import type { Rule } from './rule.js';

/**
 * Derives component `derived`, which applies in every world: entities with every component in `from` and none in
 * `not` have it, while this or any other derivation of it matches. Declare it in the file that declares `derived`.
 * Throws if `derived` isn't a registered derived component, `from` or `not` names a key that isn't a registered
 * component, or derivations cycle through a negation.
 */
export const derive = (derived: Derived, declaration: { readonly from?: readonly Key[]; readonly not?: readonly Key[] }): void => {
    const id = takeIdOfDeclaration(declaration);
    const name = id === undefined ? `derive(${labelOf(derived)})` : nameOf(declaration, id, "rule");
    const components = { has: declaration.from, not: declaration.not };
    for (const key of [...components.has ?? [], ...components.not ?? [], derived]) {
        if (kindOf(key) !== "component") throw new Error(`Component.derive of "${labelOf(derived)}" uses "${labelOf(key)}", which isn't a registered component: ${whyUnregistered(key)}.`);
    }
    if (declarationOf(derived)?.derived !== true) throw new Error(`Component.derive derives "${labelOf(derived)}", which isn't declared derived.`);
    const rule: Rule = { kind: "rule", name, declaration: { components, derive: [derived] } };
    addRule(rule, id);
};
