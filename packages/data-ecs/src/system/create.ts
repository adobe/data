import type { Schema } from '../schema/schema.js';
import type { Context, Row } from './body.js';
import type { Commands } from './commands.js';
import type { CompositeDeclaration, Composite } from './composite.js';
import type { Declaration } from './declaration.js';
import type { Leaf } from './leaf.js';
import type { LinearComponent, LinearResource } from './linear.js';
import type { Name } from './name.js';
import type { Resource } from '../resource/resource.js';
import type { Reduction } from './query.js';
import type { Listed, Property } from './property.js';

type Ordering<N> = {
    readonly before?: readonly Exclude<Name, N>[];
    readonly after?: readonly Exclude<Name, N>[];
    readonly during?: readonly Exclude<Name, N>[];
};

type Reduced<D extends Declaration> = keyof Property<Property<D, "resources">, "reduce"> & PropertyKey;

/** Names a system's lookups may not use, since they would collide in the context. */
type ReservedContextName<D extends Declaration> =
    "args" | Listed<Property<D, "resources">, "read"> | Listed<Property<D, "resources">, "write"> | Reduced<D>;

/**
 * A resource a system reduces is only its reduction there, so it can't also be read, written or filtered on; booleans
 * reduce bitwise; and a reduction folds every row, so the query has no change filters.
 */
type ReduceAlone<D extends Declaration> = {
    readonly resources?: {
        readonly read?: readonly Exclude<Resource.Name, Reduced<D>>[];
        readonly write?: readonly Exclude<Resource.Name, Reduced<D>>[];
        readonly changed?: readonly Exclude<Resource.Name, Reduced<D>>[];
        readonly reduce?: { readonly [K in Resource.Name]?: Resource.Types[K] extends boolean ? "&" | "|" | "^" : Reduction };
    };
} & ([Reduced<D>] extends [never] ? {} : { readonly query?: { readonly added?: never; readonly changed?: never } });

type Kernel = {
    readonly query?: { readonly read?: readonly LinearComponent[]; readonly write?: readonly LinearComponent[] };
    readonly lookup?: { readonly [name: string]: { readonly read?: readonly LinearComponent[] } };
    readonly resources?: { readonly read?: readonly LinearResource[]; readonly write?: never; readonly reduce?: { readonly [K in Exclude<Resource.Name, LinearResource>]?: never } };
};

/** What a GPU kernel can't use yet, beyond any kernel's limits. */
type GpuKernel = {
    readonly lookup?: { readonly [name: string]: never };
    readonly query?: { readonly added?: never; readonly changed?: never };
    readonly resources?: { readonly changed?: never; readonly reduce?: { readonly [K in Resource.Name]?: never } };
};

type Validate<D extends Declaration> =
    Ordering<D["name"]>
    & ReduceAlone<D>
    & { readonly lookup?: { readonly [K in Extract<keyof NonNullable<D["lookup"]>, ReservedContextName<D>>]: never } }
    & (D extends { readonly args: Schema } ? { readonly query?: { readonly added?: never; readonly changed?: never } } : {})
    & (D extends { readonly kernel: "cpu" | "gpu" } ? Kernel : {})
    & (D extends { readonly kernel: "gpu" } ? GpuKernel : {})
    & { readonly render?: never };

/** Declares a system. Returns its declaration and body as data; nothing runs. */
export const create = <const D extends Declaration>(
    declaration: D & Validate<D>,
    /** A GPU kernel can't issue commands. */
    body: (row: Row<D>, context: Context<D>, commands: D extends { readonly kernel: "gpu" } ? never : Commands) => void,
): Leaf<D> => ({ declaration, body });

/** Declares a system made of subsystems. */
export const composite = <const D extends CompositeDeclaration>(declaration: D & Ordering<D["name"]>): Composite<D> => ({ declaration });
