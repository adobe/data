import type { Resource } from '../resource/resource.js';
import type { Listed, Property } from '../system/property.js';
import type { ChangeSet, Context, Row, Watched } from './body.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';
import type { Changes, Leaf } from './finalizer.js';
import type { Name } from './name.js';

type Ordering<N> = { readonly before?: readonly Exclude<Name, N>[]; readonly after?: readonly Exclude<Name, N>[] };

/** A resource in `write` is readable too, so it isn't also in `read`. */
type Validate<D extends Declaration | ChangesDeclaration> = Ordering<D["name"]>
    & { readonly resources?: { readonly read?: readonly Exclude<Resource.Name, Listed<Property<D, "resources">, "write">>[] } };

/** Declares a finalizer for each entity that stops matching its components. Returns it as data; nothing runs. */
export const create = <const D extends Declaration>(
    declaration: D & Validate<D>,
    body: (row: Row<D>, context: Context<D>) => void,
): Leaf<D> => ({ kind: "finalizer", declaration, body });

/** Declares a finalizer of each sync point's structural changes. Returns it as data; nothing runs. */
export const changes = <const D extends ChangesDeclaration>(
    declaration: D & Validate<D>,
    body: (changes: ChangeSet<Watched<D>>, context: Context<D>) => void,
): Changes<D> => ({ kind: "changes", declaration, body });
