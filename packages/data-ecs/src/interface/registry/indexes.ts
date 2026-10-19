import type { Created } from '../indexes/created.js';
import { labelOfItem, recordItem, registeredAs } from './items.js';
import { firstKeyOf, labelOf, sameDeclaration } from './names.js';

/**
 * Records an index under the id the plugin gave its declaration and returns it; declared again under that id the same,
 * as a module evaluated again declares it, it's the index already recorded. Throws for that id with another kind or
 * declaration.
 */
export const addIndex = (index: Created, id: string | undefined): Created => {
    const existing = registeredAs(index, id, sameDeclaration);
    const found = existing === undefined ? undefined : indexDefinitionOf(existing);
    if (found !== undefined) return found;
    recordItem(index, id, undefined);
    return index;
};

/** Only `Index.create` makes values of kind `"index"` with a declaration. */
const isIndex = (value: object): value is Created =>
    "kind" in value && value.kind === "index" && "declaration" in value && typeof value.declaration === "object" && value.declaration !== null;

/** What `Index.create` recorded for a value, or undefined for any other value. */
export const indexDefinitionOf = (value: unknown): Created | undefined => typeof value === "object" && value !== null && isIndex(value) ? value : undefined;

type Key = symbol;

/** A lookup as a declaration holds it: by entity, or through an index. */
type AnyLookup = { readonly index?: unknown; readonly read?: readonly Key[]; readonly changed?: readonly Key[] };

/** The index a lookup goes through, or undefined for a lookup by entity. */
export const indexOfLookup = (lookup: AnyLookup): Created | undefined => lookup.index === undefined ? undefined : indexDefinitionOf(lookup.index);

/** The key parts a lookup reads to find rows: its index's, or none for a lookup by entity. */
export const lookupKeysOf = (lookup: AnyLookup): readonly Key[] => indexOfLookup(lookup)?.declaration.key ?? [];

/**
 * Throws for an index lookup whose `index` isn't a value `Index.create` returned, or whose `read` or `changed` names a
 * component that not every entity the index holds has.
 */
export const checkIndexLookup = (what: "System" | "Finalizer", name: string, lookupName: string, lookup: AnyLookup): void => {
    if (lookup.index === undefined) return;
    const index = indexDefinitionOf(lookup.index);
    if (index === undefined) throw new Error(`${what} "${name}": lookup "${lookupName}" goes through a value Index.create didn't return.`);
    const held = new Set<Key>([...index.declaration.key, ...index.declaration.components?.has ?? []].map(firstKeyOf));
    const check = (verb: string, keys: readonly Key[] | undefined): void => {
        for (const key of keys ?? []) {
            if (!held.has(firstKeyOf(key))) throw new Error(`${what} "${name}": lookup "${lookupName}" ${verb} "${labelOf(key)}", which not every entity index "${labelOfItem(index)}" holds has; name its key parts or its has.`);
        }
    };
    check("reads", lookup.read);
    check("watches", lookup.changed);
};

/** The key parts a system's rows are ordered by: its `order` index's, or none. */
export const orderKeysOf = (declaration: { readonly order?: unknown }): readonly Key[] => indexDefinitionOf(declaration.order)?.declaration.key ?? [];
