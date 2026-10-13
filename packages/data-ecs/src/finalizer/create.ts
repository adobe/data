import type { Listed, Property } from '../system/property.js';
import type { Commands } from '../system/commands.js';
import type { Changes, Context, Row, Watched } from './body.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';
import type { Leaf, Whole } from './finalizer.js';
import type { Name } from './name.js';

type Ordering<N> = { readonly before?: readonly Exclude<Name, N>[]; readonly after?: readonly Exclude<Name, N>[] };

/** A lookup named after one of the finalizer's resources would collide in the context. */
type Validate<D extends Declaration | ChangesDeclaration> = Ordering<D["name"]>
    & { readonly lookup?: { readonly [K in Extract<keyof NonNullable<D["lookup"]>, Listed<Property<D, "resources">, "read"> | Listed<Property<D, "resources">, "write">>]: never } };

/** Declares a finalizer for each entity that stops matching `query`. Returns it as data; nothing runs. */
export const create = <const D extends Declaration>(
    declaration: D & Validate<D>,
    finalize: (row: Row<D>, context: Context<D>, commands: Commands) => void,
): Leaf<D> => ({ declaration, finalize });

/** Declares a finalizer of each sync point's structural changes. Returns it as data; nothing runs. */
export const changes = <const D extends ChangesDeclaration>(
    declaration: D & Validate<D>,
    body: (changes: Changes<Watched<D>>, context: Context<D>, commands: Commands) => void,
): Whole<D> => ({ declaration, changes: body });
