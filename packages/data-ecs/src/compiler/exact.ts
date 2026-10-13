import type { Expression, ObjectExpression, Pattern } from 'estree';
import { fail } from './failure.js';
import type { ModuleScope } from './module-scope.js';

type Access = { readonly read: ReadonlySet<string>; readonly write: ReadonlySet<string> };

/** The keys a body reads and writes, by module-scope binding name; null where the body doesn't show every access. */
export type Used = {
    readonly query: Access | null;
    readonly resources: Access | null;
    /** The components read from each lookup's results, by lookup name. */
    readonly lookups: ReadonlyMap<string, ReadonlySet<string>> | null;
};

/** An object literal's plain-named properties; none for anything else. */
const fields = (node: Expression | Pattern | undefined): ReadonlyMap<string, Expression | Pattern> => new Map(node?.type !== "ObjectExpression" ? [] :
    node.properties.flatMap((property): (readonly [string, Expression | Pattern])[] =>
        property.type === "Property" && !property.computed && property.key.type === "Identifier" ? [[property.key.name, property.value]] : []));

/**
 * Requires `list` to name only keys in `used`. A list that isn't an array literal of module-scope identifiers isn't
 * checked, since its keys can't be matched to the body's.
 */
const requireUsed = (list: Expression | Pattern | undefined, used: ReadonlySet<string>, module: ModuleScope, message: (name: string) => string): void => {
    if (list?.type !== "ArrayExpression") return;
    const names = list.elements.map(element => element?.type === "Identifier" && module.has(element.name) ? element : null);
    for (const element of names) if (element === null) return;
    for (const element of names) if (element !== null && !used.has(element.name)) fail(element, message(element.name));
};

/**
 * Requires a system's declared `read` and `write` lists to be exactly what its body uses: a key it never uses
 * would still narrow which entities match, and hold back systems that could otherwise run alongside it.
 */
export const requireExact = (declaration: ObjectExpression, used: Used, module: ModuleScope): void => {
    const declared = fields(declaration);
    const query = fields(declared.get("query"));
    const resources = fields(declared.get("resources"));
    if (used.query !== null) {
        requireUsed(query.get("read"), used.query.read, module, name => `${name} is in query read but never read; remove it, or move it to query has to keep requiring it`);
        requireUsed(query.get("write"), used.query.write, module, name => `${name} is in query write but never written; remove it`);
    }
    if (used.resources !== null) {
        requireUsed(resources.get("read"), used.resources.read, module, name => `${name} is in resources read but never read; remove it`);
        requireUsed(resources.get("write"), used.resources.write, module, name => `${name} is in resources write but never written; remove it`);
    }
    if (used.lookups !== null) {
        for (const [lookup, value] of fields(declared.get("lookup"))) {
            requireUsed(fields(value).get("read"), used.lookups.get(lookup) ?? new Set(), module,
                name => `${name} is in lookup.${lookup} read but never read; remove it, or move it to lookup.${lookup} has to keep requiring it`);
        }
    }
};
