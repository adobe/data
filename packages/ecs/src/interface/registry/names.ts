// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AnyDeclaration } from './declarations.js';
import { idOfKey } from './ids.js';
import { sameItem } from './items.js';

/** What a key names. */
export type Kind = "component" | "resource" | "trait";

/**
 * A registered key: its kind, its declaration (none for a trait), its label and its id if the plugin gave one; shared
 * by every symbol registered under its id. `first` is the symbol registered first, `newest` the one registered last.
 */
type Entry = {
    readonly kind: Kind;
    readonly declaration: AnyDeclaration | undefined;
    readonly description: string;
    readonly id: string | undefined;
    readonly first: symbol;
    newest: symbol;
};

/** Every component, resource and user trait, by symbol identity: symbols of one id share an entry. */
const entries = new Map<symbol, Entry>();

/** Entries by the ids the plugin gave their keys. */
const identified = new Map<string, Entry>();

/** A symbol's description; without one, its binding, which the plugin's id names, or `Symbol()` without an id. */
const descriptionOf = (key: symbol): string => {
    if (key.description !== undefined && key.description !== "") return key.description;
    const id = idOfKey(key);
    const binding = id === undefined ? "" : id.slice(id.lastIndexOf("#") + 1);
    return binding === "" ? "Symbol()" : binding;
};

/** `Symbol.iterator` and the rest, which the platform shares, so they can't be keys. */
const wellKnown: ReadonlyMap<symbol, string> = new Map(Reflect.ownKeys(Symbol).flatMap((name): [symbol, string][] => {
    const value: unknown = Reflect.get(Symbol, name);
    return typeof value === "symbol" ? [[value, `Symbol.${String(name)}`]] : [];
}));

/** Registers what the build declared since it last ran; the registry's declarations install it. */
let catchUp = (): void => {};

/** Installs what registers the build's declarations, which every read of keys runs first. */
export const installCatchUp = (update: () => void): void => {
    catchUp = update;
};

/** Why each key the build declared failed to register, for the errors its uses give. */
const failures = new Map<symbol, string>();

/** Records why a key the build declared failed to register. */
export const recordFailure = (key: symbol, message: string): void => {
    failures.set(key, message);
};

/** A key's entry, once what the build declared is registered. */
const entryOf = (key: symbol): Entry | undefined => {
    catchUp();
    return entries.get(key);
};

/** Whether a key is a component, a resource or a trait. */
export const kindOf = (key: unknown): Kind | undefined => typeof key === "symbol" ? entryOf(key)?.kind : undefined;

/** The declaration of a registered component or resource. */
export const declarationOf = (key: unknown): AnyDeclaration | undefined => typeof key === "symbol" ? entryOf(key)?.declaration : undefined;

/** Whether two values are one key: the same value, or symbols registered under one id. */
export const sameKey = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== "symbol" || typeof b !== "symbol") return false;
    const entry = entryOf(a);
    return entry !== undefined && entry === entries.get(b);
};

/** The symbol first registered as this key, which stands for it wherever keys are compared; any other value as it is. */
export const firstKeyOf = <K>(key: K): K | symbol => typeof key === "symbol" ? entryOf(key)?.first ?? key : key;

/** The symbol last registered as this key, by which a world gives values; any other value as it is. */
export const newestKeyOf = <K>(key: K): K | symbol => typeof key === "symbol" ? entryOf(key)?.newest ?? key : key;

/**
 * How errors and reports name a key: its description, or without one its binding from its id, whatever other keys
 * have; for display only, with its id (`idOfKey`) to tell keys of one label apart. Any other value is named as text.
 */
export const labelOf = (key: unknown): string => {
    if (typeof key !== "symbol") return String(key);
    return wellKnown.get(key) ?? entries.get(key)?.description ?? descriptionOf(key);
};

/** Throws, naming the key by its label, and by `id` too where the failure is its id's, for a key registration can't take. */
export const failRegistration = (kind: Kind, key: unknown, message: string, id?: string): never => {
    throw new Error(`Cannot register ${kind} "${labelOf(key)}"${id === undefined ? "" : ` (${id})`}: ${message}`);
};

/** The key, or a throw for one that isn't a plain `Symbol(...)`: a `Symbol.for` or well-known symbol is shared. */
export const requireKey = (kind: Kind, key: unknown): symbol => {
    if (typeof key !== "symbol") return failRegistration(kind, key, `a key is a plain Symbol(...), not a ${typeof key}.`);
    if (Symbol.keyFor(key) !== undefined) return failRegistration(kind, key, "a Symbol.for key is shared across the program, so another could claim it; use Symbol(...).");
    const known = wellKnown.get(key);
    if (known !== undefined) return failRegistration(kind, key, `${known} is a well-known symbol.`);
    return key;
};

/**
 * Whether two declarations are the same, as a module evaluated again declares them, such as on a hot reload. Keys
 * compare as `sameKey` does, and systems and finalizers they list as `sameItem` does, since evaluating their modules
 * again makes new values of them.
 */
export const sameDeclaration = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a === "symbol" || typeof b === "symbol") return sameKey(a, b);
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
    if ("declaration" in a && "declaration" in b) return sameItem(a, b);
    // A set or map, such as a default, compares by its entries in order, as a module evaluated again makes them.
    if (a instanceof Set) return b instanceof Set && sameDeclaration(Array.from(a), Array.from(b));
    if (a instanceof Map) return b instanceof Map && sameDeclaration(Array.from(a), Array.from(b));
    if (b instanceof Set || b instanceof Map) return false;
    const keys = Reflect.ownKeys(a);
    const others = Reflect.ownKeys(b);
    return keys.length === others.length && keys.every(key => {
        const other = typeof key === "symbol" ? others.find(candidate => sameKey(key, candidate)) : key;
        return other !== undefined && Reflect.has(b, other) && sameDeclaration(Reflect.get(a, key), Reflect.get(b, other));
    });
};

/**
 * Records a key as a component, resource or trait, with its declaration. A symbol whose id is already a registered
 * key's, of its kind with the same declaration, as a module evaluated again makes it, is that key. Throws for a key
 * that isn't a plain `Symbol(...)`, one already registered, or one whose id is another kind's or has another
 * declaration.
 */
export const claimKey = (key: unknown, kind: Kind, declaration?: AnyDeclaration): void => {
    const symbol = requireKey(kind, key);
    const existing = entries.get(symbol);
    if (existing !== undefined) {
        failRegistration(kind, symbol, existing.kind === kind ? `already registered as a ${kind}, with another declaration.` : `already registered as a ${existing.kind}.`);
    }
    const id = idOfKey(symbol);
    const named = id === undefined ? undefined : identified.get(id);
    if (named !== undefined) {
        if (named.kind !== kind) failRegistration(kind, symbol, `its id is a ${named.kind}'s.`, id);
        if (!sameDeclaration(named.declaration, declaration)) {
            failRegistration(kind, symbol, "its id is another key's, with another declaration; if a module was evaluated again with a changed declaration, reload the page.", id);
        }
        named.newest = symbol;
        entries.set(symbol, named);
        return;
    }
    const description = descriptionOf(symbol);
    const entry: Entry = { kind, declaration, description, id, first: symbol, newest: symbol };
    if (id !== undefined) identified.set(id, entry);
    entries.set(symbol, entry);
};

/** The symbol last registered under an id, by which a world gives values, or undefined where none was. */
export const keyOfId = (id: string): symbol | undefined => {
    catchUp();
    return identified.get(id)?.newest;
};

/**
 * Why a key isn't registered, for errors: its declaration failed to register; or the build registers keys from their
 * declarations, so either its module wasn't built with the plugin, which gives keys ids, or it isn't declared.
 */
export const whyUnregistered = (key: unknown): string => {
    const failure = typeof key === "symbol" ? failures.get(key) : undefined;
    if (failure !== undefined) return `its declaration failed to register: ${failure}`;
    return typeof key === "symbol" && idOfKey(key) === undefined
        ? "the build's Compiler.plugin() registers keys from their declarations, and didn't build the module making it"
        : "declare it beside its key, in interface Components or Resources";
};
