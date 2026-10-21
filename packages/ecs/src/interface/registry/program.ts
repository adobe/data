import type { Finalizer } from '../finalizer/created.js';
import type { Rule } from '../rule/created.js';
import type { Definition } from '../system/definition.js';
import { recordItem, registeredAs } from './items.js';
import { declarationOf, firstKeyOf, labelOf, sameDeclaration } from './names.js';
import { orderFinalizers } from './finalizer-order.js';
import { strataOf, type RuleFacts } from './strata.js';

/** What a system, rule or finalizer constructor recorded. */
export type Item = Definition | Rule | Finalizer;

type Key = symbol;

const rules: Rule[] = [];
/** In the order every world runs them. */
let finalizers: readonly Finalizer[] = [];
let created = 0;

/**
 * Records a system under the id the plugin gave its declaration. Declared again under that id the same, as a module
 * evaluated again declares it, it's a new value of the same system. Throws for that id with another kind or declaration.
 */
export const claimSystem = (system: Definition, id: string | undefined): void => {
    recordItem(system, id, registeredAs(system, id, sameDeclaration));
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
        const { components, derive } = rule.declaration;
        return { has: (components.has ?? []).map(idOf), not: (components.not ?? []).map(idOf), derives: derive.map(idOf) };
    });
    strataOf(facts, hosts, id => labelOf(keys[id]));
};

/**
 * Records a rule under the id the plugin gave its declaration, which applies in every world, and returns it; declared
 * again under that id the same, it's the rule already recorded. Throws for a cycle through a negation, and for that id
 * with another kind or declaration.
 */
export const addRule = (rule: Rule, id: string | undefined): Rule => {
    const existing = registeredAs(rule, id, sameDeclaration);
    const found = existing === undefined ? undefined : rules.find(other => other === existing);
    if (found !== undefined) return found;
    checkStrata([...rules, rule]);
    recordItem(rule, id, undefined);
    rules.push(rule);
    created++;
    return rule;
};

/**
 * Records a finalizer under the id the plugin gave its declaration, which applies in every world, and returns it;
 * declared again under that id the same, it's the finalizer already recorded, which keeps its place with the new body.
 * Throws for an order that cycles or leaves a resource conflict, and for that id with another kind or declaration.
 */
export const addFinalizer = (finalizer: Finalizer, id: string | undefined): Finalizer => {
    const registered = registeredAs(finalizer, id, sameDeclaration);
    const existing = registered === undefined ? undefined : finalizers.find(other => other === registered);
    if (existing?.kind === "finalizer" && finalizer.kind === "finalizer") {
        existing.body = finalizer.body;
        return existing;
    }
    if (existing?.kind === "changes" && finalizer.kind === "changes") {
        existing.body = finalizer.body;
        return existing;
    }
    const ordered = orderFinalizers([...finalizers, finalizer]);
    recordItem(finalizer, id, undefined);
    finalizers = ordered;
    created++;
    return finalizer;
};

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
