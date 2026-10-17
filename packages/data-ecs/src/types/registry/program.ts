import type { Finalizer } from '../finalizer/created.js';
import type { Rule } from '../rule/created.js';
import type { Definition } from '../system/definition.js';

/** What a system, rule or finalizer constructor recorded. */
export type Item = Definition | Rule | Finalizer;

/** The program's systems, rules and finalizers, by name: names are unique across all three. */
const named = new Map<string, Item>();
const rules: Rule[] = [];
const finalizers: Finalizer[] = [];

/** Records an item's name. Throws if a system, rule or finalizer already has it. */
export const claim = (item: Item): void => {
    const { name } = item.declaration;
    if (named.has(name)) throw new Error(`A system, rule or finalizer named "${name}" already exists.`);
    named.set(name, item);
};

/** Records a rule, which applies in every world. */
export const addRule = (rule: Rule): void => {
    claim(rule);
    rules.push(rule);
};

/** Records a finalizer, which applies in every world. */
export const addFinalizer = (finalizer: Finalizer): void => {
    claim(finalizer);
    finalizers.push(finalizer);
};

/** The system, rule or finalizer with this name. */
export const itemNamed = (name: string): Item | undefined => named.get(name);

/** A system's definition: the value a System constructor returned, or undefined for any other value. */
export const definitionOf = (system: { readonly name: string }): Definition | undefined => {
    const item = named.get(system.name);
    return item === system && (item.kind === "system" || item.kind === "render" || item.kind === "composite") ? item : undefined;
};

/** The program's rules, in creation order. */
export const programRules = (): readonly Rule[] => rules;

/** The program's finalizers, in creation order. */
export const programFinalizers = (): readonly Finalizer[] => finalizers;
