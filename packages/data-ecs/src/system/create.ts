import type { Schema } from '../schema/schema.js';
import type { Context, Row } from './body.js';
import type { Commands } from './commands.js';
import type { CompositeDeclaration, Composite } from './composite.js';
import type { Declaration } from './declaration.js';
import type { Leaf } from './leaf.js';
import type { LinearComponent, LinearResource } from './linear.js';
import type { Name } from './name.js';
import type { Listed, Property } from './property.js';

type Ordering<N> = {
    readonly before?: readonly Exclude<Name, N>[];
    readonly after?: readonly Exclude<Name, N>[];
    readonly during?: readonly Exclude<Name, N>[];
};

/** Names a system's lookups may not use, since they would collide in the context. */
type ReservedContextName<D extends Declaration> =
    "args" | Listed<Property<D, "resources">, "read"> | Listed<Property<D, "resources">, "write">;

type Kernel = {
    readonly query?: { readonly read?: readonly LinearComponent[]; readonly write?: readonly LinearComponent[] };
    readonly lookup?: { readonly [name: string]: { readonly read?: readonly LinearComponent[] } };
    readonly resources?: { readonly read?: readonly LinearResource[]; readonly write?: never };
};

type Validate<D extends Declaration> =
    Ordering<D["name"]>
    & { readonly lookup?: { readonly [K in Extract<keyof NonNullable<D["lookup"]>, ReservedContextName<D>>]: never } }
    & (D extends { readonly args: Schema } ? { readonly query?: { readonly added?: never; readonly changed?: never } } : {})
    & (D extends { readonly kernel: true } ? Kernel : {})
    & { readonly render?: never };

/** Declares a system. Returns its declaration and body as data; nothing runs. */
export const create = <const D extends Declaration>(
    declaration: D & Validate<D>,
    body: (row: Row<D>, context: Context<D>, commands: Commands) => void,
): Leaf<D> => ({ declaration, body });

/** Declares a system made of subsystems. */
export const composite = <const D extends CompositeDeclaration>(declaration: D & Ordering<D["name"]>): Composite<D> => ({ declaration });
