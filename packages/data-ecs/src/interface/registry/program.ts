import type { Finalizer } from '../finalizer/created.js';
import type { Rule } from '../rule/created.js';
import type { Definition } from '../system/definition.js';
import { declarationOf, firstKeyOf, labelOf, sameDeclaration } from './names.js';
import { orderFinalizers } from './finalizer-order.js';
import { strataOf, type RuleFacts } from './strata.js';

/** What a system, rule or finalizer constructor recorded. */
export type Item = Definition | Rule | Finalizer;

type Key = symbol;

/** The program's systems, rules and finalizers, by name: names are unique across all three. */
const named = new Map<string, Item>();
const rules: Rule[] = [];
/** In the order every world runs them. */
let finalizers: readonly Finalizer[] = [];
let created = 0;

/** The item already named as `item` is, when it's the same kind with the same declaration: a module evaluated again. */
const repeated = (item: Item): Item | undefined => {
    const existing = named.get(item.declaration.name);
    return existing !== undefined && existing.kind === item.kind && sameDeclaration(existing.declaration, item.declaration) ? existing : undefined;
};

/**
 * Records an item's name, replacing one a module evaluated again declared the same. Throws if a different system, rule
 * or finalizer has it.
 */
export const claim = (item: Item): void => {
    const { name } = item.declaration;
    const existing = named.get(name);
    if (existing !== undefined && existing !== item && repeated(item) === undefined) {
        throw new Error(`A different system, rule or finalizer named "${name}" already exists; if a module was evaluated again with a changed declaration, reload the page.`);
    }
    named.set(name, item);
};

/** Every rule's facts with the `within` hosts of their components, numbered for this check only. Throws for a cycle. */
const checkStrata = (all: readonly Rule[]): void => {
    const ids = new Map<Key, number>();
    const keys: Key[] = [];
    const hosts: number[] = [];
    const idOf = (symbol: Key): number => {
        const key = firstKeyOf(symbol);
        const existing = ids.get(key);
        if (existing !== undefined) return existing;
        const id = keys.length;
        ids.set(key, id);
        keys.push(key);
        hosts.push(-1);
        const within = declarationOf(key)?.within;
        if (typeof within === "symbol") hosts[id] = idOf(within);
        return id;
    };
    const facts = all.map((rule): RuleFacts => {
        const { name, components, derive } = rule.declaration;
        return { name, has: (components.has ?? []).map(idOf), not: (components.not ?? []).map(idOf), derives: derive.map(idOf) };
    });
    strataOf(facts, hosts, id => labelOf(keys[id]));
};

/** Records a rule, which applies in every world; the same rule again is already recorded. Throws for a cycle through a negation. */
export const addRule = (rule: Rule): void => {
    if (repeated(rule) !== undefined) return;
    checkStrata([...rules, rule]);
    claim(rule);
    rules.push(rule);
    created++;
};

/**
 * Records a finalizer, which applies in every world, and returns it. The same finalizer again keeps its place, with the
 * new body. Throws for an order that cycles or leaves a resource conflict.
 */
export const addFinalizer = (finalizer: Finalizer): Finalizer => {
    const existing = repeated(finalizer);
    if (existing?.kind === "finalizer" && finalizer.kind === "finalizer") {
        existing.body = finalizer.body;
        return existing;
    }
    if (existing?.kind === "changes" && finalizer.kind === "changes") {
        existing.body = finalizer.body;
        return existing;
    }
    const ordered = orderFinalizers([...finalizers, finalizer].map(item => ({ name: item.declaration.name, finalizer: item })));
    claim(finalizer);
    finalizers = ordered.map(item => item.finalizer);
    created++;
    return finalizer;
};

/** The system, rule or finalizer with this name. */
export const itemNamed = (name: string): Item | undefined => named.get(name);

/** Only constructors make values with a system's kind and a declaration. */
const isDefinition = (system: object): system is Definition =>
    "declaration" in system && "kind" in system && (system.kind === "system" || system.kind === "render" || system.kind === "composite");

/** A system's definition: the value a System constructor returned, or undefined for any other value. */
export const definitionOf = (system: { readonly name: string }): Definition | undefined => isDefinition(system) ? system : undefined;

/** A system's definition. Throws for a value no constructor returned. */
export const requireDefinition = (system: { readonly name: string }): Definition => {
    const definition = definitionOf(system);
    if (definition === undefined) throw new Error(`"${String(system.name)}" isn't a system a System constructor returned.`);
    return definition;
};

/** Counts rules and finalizers recorded, so a world can tell when one was added since it last looked. */
export const programVersion = (): number => created;

/** The program's rules, in creation order. */
export const programRules = (): readonly Rule[] => rules;

/** The program's finalizers, in the order every world runs them. */
export const programFinalizers = (): readonly Finalizer[] => finalizers;
