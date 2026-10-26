// © 2026 Adobe. MIT License. See /LICENSE for details.
import { takeLabelOfDeclaration } from './ids.js';
/** A registered system, rule or finalizer: what each constructor records, told apart by `kind`. */
type Registered = { readonly kind: string; readonly name: string; readonly declaration: object };

/**
 * A registered item: its kind and declaration, those of the first value registered under its id, and its id if the
 * plugin gave one; shared by every value registered under its id. `first` is the value registered first, which stands
 * for it wherever items compare.
 */
type Entry = {
    readonly kind: string;
    readonly declaration: object;
    readonly id: string | undefined;
    readonly first: Registered;
};

/** Every system, rule and finalizer, by value: values of one id share an entry. */
const entries = new WeakMap<object, Entry>();

/** Entries by the ids the plugin gave their declarations. */
const identified = new Map<string, Entry>();

/** Whether two values are one item: the same value, or values registered under one id. */
export const sameItem = (a: object, b: object): boolean => {
    if (a === b) return true;
    const entry = entries.get(a);
    return entry !== undefined && entry === entries.get(b);
};

/** The value first registered as this item, which stands for it wherever items compare; any other value as it is. */
export const firstItemOf = (item: object): object => entries.get(item)?.first ?? item;

/**
 * The item already registered under `id` that `item` is: one of its kind with the same declaration, as a module
 * evaluated again declares it; undefined without an id or for an id not registered. Throws for an id registered as
 * another kind or with another declaration. `same` compares declarations.
 */
export const registeredAs = <T extends Registered>(item: T, id: string | undefined, same: (a: unknown, b: unknown) => boolean): object | undefined => {
    if (id === undefined) return undefined;
    const entry = identified.get(id);
    if (entry === undefined) return undefined;
    if (entry.kind !== item.kind) throw new Error(`Cannot declare "${item.name}" (${id}): its id is a ${entry.kind}'s.`);
    if (!same(entry.declaration, item.declaration)) {
        throw new Error(`Cannot declare "${item.name}" (${id}): its id is another item's, with another declaration; if a module was evaluated again with a changed declaration, reload the page.`);
    }
    return entry.first;
};

/**
 * Records an item under its id: a value of an item `registeredAs` found shares its entry, and any other is a new item.
 */
export const recordItem = (item: Registered, id: string | undefined, existing: object | undefined): void => {
    const shared = existing === undefined ? undefined : entries.get(existing);
    if (shared !== undefined) {
        entries.set(item, shared);
        return;
    }
    const entry: Entry = { kind: item.kind, declaration: item.declaration, id, first: item };
    if (id !== undefined) identified.set(id, entry);
    entries.set(item, entry);
};

/** How many items of each kind were labeled by number, to number the next. */
const anonymous = new Map<string, number>();

/**
 * An item's label: the one the plugin gave its constructor call's first argument, `value`, by the binding or function
 * it's in, or an internal factory gave it; else its binding, from its id (`spawn` for `src/setup.ts#spawn`); else its
 * kind numbered by creation (`system #3`).
 */
export const nameOf = (value: object, id: string | undefined, kind: "system" | "rule" | "finalizer" | "index"): string => {
    const label = takeLabelOfDeclaration(value);
    if (label !== undefined) return label;
    if (id !== undefined) return id.slice(id.lastIndexOf("#") + 1);
    const count = (anonymous.get(kind) ?? 0) + 1;
    anonymous.set(kind, count);
    return `${kind} #${count}`;
};

/** The id the plugin gave an item, or null without one, as failures give it beside its label. */
export const idOrNull = (item: object): string | null => entries.get(item)?.id ?? null;

/** The id the plugin gave a system, rule or finalizer, by which other threads name it, if it gave one. */
export const idOfItem = (item: object): string | undefined => entries.get(item)?.id;

/** The item first registered under an id, or undefined where no module declaring it was imported. */
export const itemOfId = (id: string): { readonly kind: string; readonly name: string } | undefined => identified.get(id)?.first;

/** The ids of every system, rule and finalizer of `kind` registered with one, as a joined thread tells the world what it imported. */
export const identifiedItems = (kind: string): readonly string[] => {
    const found: string[] = [];
    for (const [id, entry] of identified) if (entry.kind === kind) found.push(id);
    return found;
};
