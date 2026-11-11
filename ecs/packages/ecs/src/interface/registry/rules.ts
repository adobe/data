// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Rule } from '../component/rule.js';
import { recordItem, registeredAs } from './items.js';
import { declarationOf, firstKeyOf, labelOf, sameDeclaration } from './names.js';
import { strataOf, type RuleFacts } from './strata.js';

type Key = symbol;

const rules: Rule[] = [];
let created = 0;

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
 * Records a rule, a derivation `Component.derive` declared, under the id the plugin gave its declaration, which applies
 * in every world, and returns it; declared again under that id the same, it's the rule already recorded. Throws for a
 * cycle through a negation, and for that id with another kind or declaration.
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

/** Counts rules recorded, so a world can tell when one was added since it last looked. */
export const programVersion = (): number => created;

/** The program's rules, in creation order. */
export const programRules = (): readonly Rule[] => rules;
