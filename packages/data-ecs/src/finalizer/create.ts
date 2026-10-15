import { addFinalizer } from '../world/create/program.js';
import type { Resource } from '../resource/resource.js';
import type { Listed, Property } from '../system/property.js';
import type { ChangeSet, Context, Row, Watched } from './body.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';
import type { Changes, Leaf } from './created.js';
import type { Finalizer } from './finalizer.js';
import type { Name } from './name.js';

/** A resource in `write` is readable too, so it isn't also in `read`. */
type Validate<D extends Declaration | ChangesDeclaration> =
    { readonly resources?: { readonly read?: readonly Exclude<Resource.Name, Listed<Property<D, "resources">, "write">>[] } };

/**
 * Declares a finalizer for each entity that stops matching its components, which applies in every world. Throws if a different system, rule or finalizer has its name, or the program's finalizers can't be ordered.
 */
export const create = <const D extends Declaration>(
    declaration: D & Validate<D>,
    body: (row: Row<D>, context: Context<D>) => void,
): Finalizer<D["name"]> => {
    const finalizer: Leaf<D> & Finalizer<D["name"]> = { kind: "finalizer", name: declaration.name, declaration, body };
    addFinalizer(finalizer);
    return finalizer;
};

/**
 * Declares a finalizer of each sync point's structural changes, which applies in every world. Throws as
 * `create` does.
 */
export const changes = <const D extends ChangesDeclaration>(
    declaration: D & Validate<D>,
    body: (changes: ChangeSet<Watched<D>>, context: Context<D>) => void,
): Finalizer<D["name"]> => {
    const finalizer: Changes<D> & Finalizer<D["name"]> = { kind: "changes", name: declaration.name, declaration, body };
    addFinalizer(finalizer);
    return finalizer;
};
