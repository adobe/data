/** A registered system, rule or finalizer: what each constructor records, told apart by `kind`. */
type Registered = { readonly kind: string; readonly name: string; readonly declaration: object };

/**
 * A registered item: its kind and declaration, those of the first value registered under its id, its name, its id if
 * the plugin gave one, and the label it has without one, numbered when another item had its name; shared by every
 * value registered under its id. `first` is the value registered first, which stands for it wherever items compare.
 */
type Entry = {
    readonly kind: string;
    readonly declaration: object;
    readonly name: string;
    readonly id: string | undefined;
    readonly numbered: string;
    readonly first: object;
};

/** Every system, rule and finalizer, by value: values of one id share an entry. */
const entries = new WeakMap<object, Entry>();

/** Entries by the ids the plugin gave their declarations. */
const identified = new Map<string, Entry>();

/** Numbered labels given, so each item's is unique. */
const labels = new Set<string>();

/** How many registered items have each name. */
const named = new Map<string, number>();

/** Whether two values are one item: the same value, or values registered under one id. */
export const sameItem = (a: object, b: object): boolean => {
    if (a === b) return true;
    const entry = entries.get(a);
    return entry !== undefined && entry === entries.get(b);
};

/** The value first registered as this item, which stands for it wherever items compare; any other value as it is. */
export const firstItemOf = (item: object): object => entries.get(item)?.first ?? item;

/**
 * How errors and reports name a system, rule or finalizer: its name while no other registered item has it, else its
 * name with its id when the plugin gave one, and without one its name numbered by registration order. An item not
 * registered is named by its name.
 */
export const labelOfItem = (item: { readonly name: string }): string => {
    const entry = entries.get(item);
    if (entry === undefined || (named.get(entry.name) ?? 0) <= 1) return item.name;
    return entry.id === undefined ? entry.numbered : `${entry.name} (${entry.id})`;
};

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

/** A label for an item registered now without an id, its name numbered when another item's has it. */
const numberedFor = (name: string): string => {
    let label = name;
    for (let n = 2; labels.has(label); n++) label = `${name}#${n}`;
    labels.add(label);
    return label;
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
    const entry: Entry = { kind: item.kind, declaration: item.declaration, name: item.name, id, numbered: numberedFor(item.name), first: item };
    named.set(item.name, (named.get(item.name) ?? 0) + 1);
    if (id !== undefined) identified.set(id, entry);
    entries.set(item, entry);
};

/** How many items of each kind were declared without a name or an id, to number their labels. */
const anonymous = new Map<string, number>();

/**
 * An item's name: the one its declaration gives; without one, its binding with the id the plugin gave it
 * (`spawn (src/setup.ts#spawn)`), and without an id, its kind numbered by creation (`system #3`).
 */
export const nameOf = (name: string | undefined, id: string | undefined, kind: "system" | "rule" | "finalizer"): string => {
    if (name !== undefined) return name;
    if (id !== undefined) return `${id.slice(id.lastIndexOf("#") + 1)} (${id})`;
    const count = (anonymous.get(kind) ?? 0) + 1;
    anonymous.set(kind, count);
    return `${kind} #${count}`;
};
