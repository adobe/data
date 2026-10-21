import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Index } from '../indexes/index-type.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { nameOf } from '../registry/items.js';
import { claimSystem } from '../registry/program.js';
import type { Resource } from '../resource/resource.js';
import type { Schema } from '../schema/schema.js';
import type { Body } from './body.js';
import type { Commands } from './commands.js';
import { checkComposite, checkLeaf } from './check.js';
import type { Composite } from './composite.js';
import type { CompositeDeclaration } from './composite-declaration.js';
import type { Declaration } from './declaration.js';
import type { CheckMembers, CompositeInputOf, InputOf } from './input.js';
import type { Leaf } from './leaf.js';
import type { Listed, Property } from './property.js';
import type { StructComponent, StructResource } from './struct.js';
import type { System } from './system.js';
import type { OneThread, ThreadsOf } from './threads.js';
import type { HeldBy } from './values.js';

type Reduced<D extends Declaration> = keyof Property<D, "reduce"> & Resource.Key;
type Written<D, K extends "components" | "resources"> = Listed<Property<D, K>, "write">;
type Is<D> = Listed<Property<D, "resources">, "is">;
type Lookups<D> = Property<D, "lookup">;

/**
 * An index lookup reads and watches only what every entity its index holds has, and its system doesn't write what it
 * finds rows by or reads through it. A lookup by entity watches only what it reads or has.
 */
type IndexLookups<D> = {
    readonly lookup?: {
        readonly [N in keyof Lookups<D>]?: Lookups<D>[N] extends { readonly index: Index<infer I> }
            ? {
                readonly index?: Index<{ readonly key: readonly Exclude<Component.Key, Written<D, "components">>[] }>;
                readonly read?: readonly Exclude<HeldBy<I>, Written<D, "components">>[];
                readonly changed?: readonly HeldBy<I>[] | true;
            }
            : { readonly changed?: readonly (Listed<Lookups<D>[N], "read"> | Listed<Lookups<D>[N], "has">)[] }
    };
};

/** A system's rows are ordered by an index whose key parts it doesn't write. */
type Order<D> = { readonly order?: Index<{ readonly key: readonly Exclude<Component.Key, Written<D, "components">>[] }> };

/**
 * A key in `write` is readable too, so it isn't also in `read`. A system doesn't read or filter on what it reduces
 * into, since the fold is only finished after every contributor runs. A condition in `is` is readable too, and isn't
 * written or also in `not`.
 */
type Lists<D extends Declaration> = {
    readonly components?: { readonly read?: readonly Exclude<Component.Key, Written<D, "components">>[] };
    readonly resources?: {
        readonly read?: readonly Exclude<Resource.Key, Written<D, "resources"> | Reduced<D> | Is<D>>[];
        readonly write?: readonly Exclude<Resource.Key, Is<D>>[];
        readonly changed?: readonly Exclude<Resource.Key, Reduced<D>>[];
        readonly not?: readonly Exclude<Resource.Key, Is<D>>[];
    };
};

type Kernel = {
    readonly components?: { readonly read?: readonly StructComponent[]; readonly write?: readonly StructComponent[] };
    readonly lookup?: {
        readonly [name: string]:
            | { readonly read?: readonly StructComponent[]; readonly has?: readonly Component.Key[]; readonly not?: readonly Component.Key[]; readonly changed?: readonly Component.Key[]; readonly index?: never }
            | { readonly read?: readonly StructComponent[]; readonly changed?: readonly Component.Key[] | true; readonly index: Index<{ readonly key: readonly StructComponent[] }> };
    };
    readonly up?: { readonly read?: readonly StructComponent[] };
    readonly order?: Index<{ readonly key: readonly StructComponent[] }>;
    readonly resources?: { readonly read?: readonly StructResource[]; readonly write?: never };
};

/** What a GPU kernel can't use yet, beyond any kernel's limits. */
type GpuKernel = {
    readonly lookup?: { readonly [name: string]: never };
    readonly components?: { readonly added?: never; readonly changed?: never };
    readonly resources?: { readonly changed?: never };
    readonly reduce?: { readonly [K in Resource.Key]?: never };
    readonly order?: { readonly "error: GPU kernels have no order yet": true };
};

/**
 * An observer system only reads, after a sync point: it writes and reduces into nothing, takes no input, isn't a
 * kernel, has no `up`, and is ordered with nothing.
 */
type Observer = {
    readonly kernel?: never;
    readonly components?: { readonly write?: never };
    readonly resources?: { readonly write?: never };
    readonly reduce?: never;
    readonly input?: never;
    readonly up?: never;
    readonly before?: never;
    readonly after?: never;
    readonly during?: never;
};

/** The fields of input `I` that hold an entity. */
type EntityFields<I> = { [K in keyof I]-?: [Exclude<I[K], undefined>] extends [Entity] ? K : never }[keyof I] & string;

/** A system on one entity takes it from an entity field of its input, and runs on its row, in no order. */
type Targeted<D extends Declaration> = {
    readonly target?: EntityFields<InputOf<D>>;
    readonly kernel?: never;
    readonly up?: never;
    readonly order?: never;
    readonly reduce?: never;
};

type Validate<D extends Declaration> =
    Lists<D>
    & IndexLookups<D>
    & Order<D>
    & (D extends { readonly input: Schema } ? { readonly components?: { readonly added?: never; readonly changed?: never } } : {})
    & (D extends { readonly kernel: "cpu" | "gpu" } ? Kernel : {})
    & (D extends { readonly kernel: "gpu" } ? GpuKernel : {})
    // `up` and `order` order rows, so a system without them has neither, and one has at most one of them.
    & (Property<D, "components"> extends undefined ? { readonly up?: { readonly [key: string]: never }; readonly order?: { readonly "error: a system without components runs once, in no order": true } } : {})
    & (D extends { readonly up: object } ? { readonly order?: { readonly "error: up and order both decide the order of its rows": true } } : {})
    & (D extends { readonly observer: true } ? Observer : {})
    & (D extends { readonly target: string } ? Targeted<D> : {})
    & (D extends { readonly target: string } ? Property<D, "components"> extends undefined ? { readonly target?: { readonly "error: a system on one entity runs on its row, so it needs components": true } } : {} : {})
    & { readonly shader?: never };

/** The body of a system that declares nothing, which runs once per run with its commands. */
type Alone = (context: { readonly commands: Commands }) => void;

/** A composite: its list of members, or its declaration. */
type Composition = readonly System<unknown>[] | CompositeDeclaration;

/** A composite's members. */
type MembersOf<C> = C extends CompositeDeclaration ? C["systems"] : C;

/** A member whose input has a field of a different type than another member's becomes the error saying so. */
type Checked<C> = C extends Alone ? unknown : C extends CompositeDeclaration ? { readonly systems: CheckMembers<C["systems"]> } : CheckMembers<C>;

/**
 * Declares a system and returns it; nothing runs. The arguments tell the forms apart:
 * - `create(body)`: a system that declares nothing, whose body runs once per run with its commands.
 * - `create(declaration, body)`: a system.
 * - `create([move, collide])`: a composite of the systems listed, which may live on different threads.
 * - `create({ systems: [move, collide], after: [input] })`: a composite with a name or constraints.
 *
 * Each run passes a composite's members one input, with every field of theirs. Throws if a system names a key that
 * isn't registered as its kind, lists a key in both `read` and `write`, writes a reference, a lookup reads a component
 * it writes or goes through an index keyed by one, or reads through an index what not every entity it holds has, its
 * rows are ordered by an index it isn't sorted or keyed by what it writes, its object components and resources live on
 * different threads, or its reductions, conditions, `up`, `order` or placement can't hold, or it's an observer and
 * writes, reduces, takes input, is a kernel, has `up` or is ordered; or if a composite's member isn't a system a
 * constructor returned, or two members declare an input field with different schemas. A composite's observer members
 * run after its sync point, ordered with nothing.
 *
 * One argument, a body or a composite, is one overload, so a mistake in it is reported where it is rather than as no
 * overload matching.
 */
export function create<const D extends Declaration>(declaration: D & Validate<D> & OneThread<ThreadsOf<D>>, body: Body<D>): System<InputOf<D>>;
export function create<const C extends Alone | Composition>(only: C & Checked<C>): C extends Alone ? System : System<CompositeInputOf<MembersOf<C>>>;
export function create(first: Declaration | Leaf["body"] | readonly System<unknown>[] | CompositeDeclaration, second?: Leaf["body"]): System<unknown> {
    // The plugin gives its id to the call's first argument: the declaration, the members, or the body made into a
    // system alone.
    const id = takeIdOfDeclaration(first);
    if (isList(first)) return compose({ systems: first }, id);
    if (typeof first !== "function" && second === undefined && "systems" in first) return compose(first, id);
    const declaration: Declaration = typeof first === "function" ? {} : first;
    const body = typeof first === "function" ? first : second;
    if (body === undefined) throw new Error("A system needs a body, and a composite its systems.");
    const system: Leaf & System<unknown> = { kind: "system", name: nameOf(declaration.name, id, "system"), declaration, body };
    checkLeaf(system);
    claimSystem(system, id);
    return system;
}

const isList = (value: unknown): value is readonly System<unknown>[] => Array.isArray(value);

const compose = (declaration: CompositeDeclaration, id: string | undefined): System<unknown> => {
    const system: Composite & System<unknown> = { kind: "composite", name: nameOf(declaration.name, id, "system"), declaration };
    checkComposite(system);
    claimSystem(system, id);
    return system;
};
