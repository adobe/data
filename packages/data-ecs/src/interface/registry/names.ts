import type { AnyDeclaration } from './declarations.js';

/** What a key names. */
export type Kind = "component" | "resource" | "trait";

/** A registered key: its kind, its declaration (none for a trait) and its label. */
type Entry = { readonly kind: Kind; readonly declaration: AnyDeclaration | undefined; readonly label: string };

/** Every component, resource and user trait, by key identity. */
const entries = new Map<symbol, Entry>();

/** Labels given, so each key's is unique. */
const labels = new Set<string>();

/** `Symbol.iterator` and the rest, which the platform shares, so they can't be keys. */
const wellKnown: ReadonlyMap<symbol, string> = new Map(Reflect.ownKeys(Symbol).flatMap((name): [symbol, string][] => {
    const value: unknown = Reflect.get(Symbol, name);
    return typeof value === "symbol" ? [[value, `Symbol.${String(name)}`]] : [];
}));

/** Whether a key is a component, a resource or a trait. */
export const kindOf = (key: unknown): Kind | undefined => typeof key === "symbol" ? entries.get(key)?.kind : undefined;

/** The declaration of a registered component or resource. */
export const declarationOf = (key: unknown): AnyDeclaration | undefined => typeof key === "symbol" ? entries.get(key)?.declaration : undefined;

/**
 * How errors and reports name a key: a registered key's label, unique among them and kept once given; its description,
 * numbered by registration order when another key's label has it. An unregistered key is named by its description,
 * `Symbol()` without one, and any other value as text.
 */
export const labelOf = (key: unknown): string => {
    if (typeof key !== "symbol") return String(key);
    return entries.get(key)?.label ?? wellKnown.get(key) ?? (key.description === undefined || key.description === "" ? "Symbol()" : key.description);
};

/** A unique label for a key registered now. */
const labelFor = (key: symbol): string => {
    const base = labelOf(key);
    let label = base;
    for (let n = 2; labels.has(label); n++) label = `${base}#${n}`;
    labels.add(label);
    return label;
};

/** Throws, naming the key, for a key registration can't take. */
export const failRegistration = (kind: Kind, key: unknown, message: string): never => {
    throw new Error(`Cannot register ${kind} "${labelOf(key)}": ${message}`);
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
 * Records a key as a component, resource or trait, with its declaration. Throws for a key that isn't a plain
 * `Symbol(...)`, or one already registered.
 */
export const claimKey = (key: unknown, kind: Kind, declaration?: AnyDeclaration): void => {
    const symbol = requireKey(kind, key);
    const existing = entries.get(symbol);
    if (existing !== undefined) {
        failRegistration(kind, symbol, existing.kind === kind ? `already registered as a ${kind}, with another declaration.` : `already registered as a ${existing.kind}.`);
    }
    entries.set(symbol, { kind, declaration, label: labelFor(symbol) });
};
