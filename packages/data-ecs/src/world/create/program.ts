import type { Finalizer } from '../../finalizer/created.js';
import { declarationOf } from '../../registry/create-registry.js';
import { kindOf } from '../../registry/declare-name.js';
import type { Rule } from '../../rule/created.js';
import type { Definition } from '../../system/definition.js';
import { strataOf, type RuleFacts } from './closure.js';
import { orderFinalizers } from './finalizers.js';
import type { Key } from './state.js';

/**
 * The program's systems, rules and finalizers. Names are unique across all three. Rules and finalizers apply in every
 * world, each from the first sync point after the world has met every component it needs.
 */
const named = new Map<string, Definition | Rule | Finalizer>();
const rules: Rule[] = [];
/** In the order every world runs them. */
let finalizers: readonly Finalizer[] = [];
let created = 0;

/** Records each item's name. Throws, recording none, if a different system, rule or finalizer has one. */
export const claim = (...items: readonly (Definition | Rule | Finalizer)[]): void => {
    for (const item of items) {
        const { name } = item.declaration;
        const existing = named.get(name);
        if (existing !== undefined && existing !== item) throw new Error(`A different system, rule or finalizer named "${name}" already exists.`);
    }
    for (const item of items) named.set(item.declaration.name, item);
};

/** A system created or run anywhere in the program, by name. */
export const systemNamed = (name: string): Definition | null => {
    const item = named.get(name);
    return item === undefined || item.kind === "rule" || item.kind === "finalizer" || item.kind === "changes" ? null : item;
};

const requireComponent = (kind: string, name: string, key: Key): void => {
    if (declarationOf(key) === undefined) throw new Error(`${kind} "${name}" uses "${String(key)}", which has no registered schema; import the module that registers it.`);
    if (kindOf(key) === "resource") throw new Error(`${kind} "${name}" matches on "${String(key)}", which is a resource.`);
};

/** Every rule's facts with the `within` hosts of their components, numbered for this check only. Throws for a cycle. */
const checkStrata = (all: readonly Rule[]): void => {
    const ids = new Map<Key, number>();
    const keys: Key[] = [];
    const hosts: number[] = [];
    const idOf = (key: Key): number => {
        const existing = ids.get(key);
        if (existing !== undefined) return existing;
        const id = keys.length;
        ids.set(key, id);
        keys.push(key);
        hosts.push(-1);
        const within = declarationOf(key)?.within;
        if (typeof within === "string" || typeof within === "symbol") hosts[id] = idOf(within);
        return id;
    };
    const facts = all.map((rule): RuleFacts => {
        const { name, components, derive } = rule.declaration;
        return { name, has: (components.has ?? []).map(idOf), not: (components.not ?? []).map(idOf), derives: derive.map(idOf) };
    });
    strataOf(facts, hosts, id => String(keys[id]));
};

/** Adds a rule to the program. Throws if it derives a component that isn't derived, or its rules cycle through a negation. */
export const addRule = (rule: Rule): void => {
    const { name, components, derive } = rule.declaration;
    for (const key of [...components.has ?? [], ...components.not ?? [], ...derive]) requireComponent("Rule", name, key);
    for (const key of derive) {
        if (declarationOf(key)?.derived !== true) throw new Error(`Rule "${name}" derives "${String(key)}", which isn't declared derived.`);
    }
    checkStrata([...rules, rule]);
    claim(rule);
    rules.push(rule);
    created++;
};

/** Throws if a key is in both `read` and `write`: `write` already makes it readable. */
const checkLists = (name: string, what: string, lists: { readonly read?: readonly Key[]; readonly write?: readonly Key[] } | undefined): void => {
    const writes = new Set(lists?.write);
    const both = (lists?.read ?? []).find(key => writes.has(key));
    if (both !== undefined) throw new Error(`Finalizer "${name}" lists "${String(both)}" in both ${what} read and write; write already makes it readable.`);
};

/** Adds a finalizer to the program. Throws for an invalid declaration, or an order that cycles or leaves a resource conflict. */
export const addFinalizer = (finalizer: Finalizer): void => {
    const { name, resources, lookup } = finalizer.declaration;
    checkLists(name, "resources", resources);
    for (const key of resources?.write ?? []) {
        if (declarationOf(key)?.reduce !== undefined) throw new Error(`Finalizer "${name}" writes "${String(key)}", which is reduced; only its contributors' fold sets it.`);
    }
    for (const key of [...resources?.read ?? [], ...resources?.write ?? []]) {
        if (kindOf(key) !== "resource") throw new Error(`Finalizer "${name}" uses resource "${String(key)}", which isn't a registered resource.`);
    }
    for (const lookupName in lookup) for (const key of [...lookup[lookupName].read ?? [], ...lookup[lookupName].has ?? [], ...lookup[lookupName].not ?? []]) requireComponent("Finalizer", name, key);
    if (finalizer.kind === "finalizer") {
        const { components } = finalizer.declaration;
        for (const key of [...components.read ?? [], ...components.has ?? [], ...components.not ?? []]) requireComponent("Finalizer", name, key);
    }
    else {
        for (const key of finalizer.declaration.watch ?? []) {
            requireComponent("Finalizer", name, key);
            if (declarationOf(key)?.derived === true) throw new Error(`Finalizer "${name}" watches "${String(key)}", which is derived; it sees only components user code adds and removes.`);
        }
    }
    const ordered = orderFinalizers([...finalizers, finalizer].map(item => ({ name: item.declaration.name, finalizer: item })));
    claim(finalizer);
    finalizers = ordered.map(item => item.finalizer);
    created++;
};

/** Counts rules and finalizers added, so a world can tell when one was added since it last looked. */
export const programVersion = (): number => created;

export const programRules = (): readonly Rule[] => rules;

/** In the order every world runs them. */
export const programFinalizers = (): readonly Finalizer[] => finalizers;

/**
 * The components a world must have met before the item can match anything there: all of them, or for a changes
 * finalizer any one it watches. Empty when it can match from the start.
 */
export const triggersOf = (item: Rule | Finalizer): { readonly keys: readonly Key[]; readonly any: boolean } => {
    if (item.kind === "rule") return { keys: item.declaration.components.has ?? [], any: false };
    if (item.kind === "finalizer") return { keys: [...item.declaration.components.read ?? [], ...item.declaration.components.has ?? []], any: false };
    return { keys: item.declaration.watch ?? [], any: true };
};
