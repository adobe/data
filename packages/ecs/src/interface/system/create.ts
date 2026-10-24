// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from '../entity/entity.js';
import type { Index } from '../indexes/index-type.js';
import type { Condition } from '../resource/condition.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { nameOf } from '../registry/items.js';
import { claimSystem } from '../registry/program.js';
import type { Body, Context } from './body.js';
import { checkComposite, checkLeaf, inputSchemaOf } from './check.js';
import type { Composite } from './composite.js';
import type { CompositeDeclaration } from './composite-declaration.js';
import type { Declaration, Resolved } from './declaration.js';
import type { CheckMembers, CompositeInputOf, InputOf } from './input.js';
import type { Leaf } from './leaf.js';
import type { Listed, Property } from './property.js';
import type { System } from './system.js';
import type { OneThread, ThreadedBy, ThreadsOf } from './threads.js';
import type { HeldBy } from './values.js';
import { accessOf, compact, componentLists, lookupsLists, resourceUses, upReads } from './resolve.js';

type Lookups<D> = Property<D, "lookup">;

/** A lookup's `changed` names what it requires: a lookup by entity's `with`, an index lookup's what its index holds. */
type LookupChanges<D> = {
    readonly lookup?: {
        readonly [N in keyof Lookups<D>]?: Lookups<D>[N] extends { readonly index: Index<infer I> }
            ? { readonly changed?: readonly HeldBy<I>[] | true }
            : { readonly changed?: readonly Listed<Lookups<D>[N], "with">[] }
    };
};

/** What a body reads, writes and reduces into is inferred, never declared. */
type Inferred = {
    readonly components?: { readonly read?: never; readonly write?: never; readonly has?: never };
    readonly resources?: { readonly read?: never; readonly write?: never; readonly reduce?: never };
    readonly up?: { readonly read?: never };
    readonly reduce?: never;
};

/** A condition is in `is` or `not`, not both. */
type Conditions<D> = { readonly resources?: { readonly not?: readonly Exclude<Condition, Listed<Property<D, "resources">, "is">>[] } };

/** What a GPU kernel can't use yet, beyond any kernel's limits. */
type GpuKernel = {
    readonly lookup?: { readonly [name: string]: never };
    readonly components?: { readonly added?: never; readonly changed?: never };
    readonly resources?: { readonly changed?: never };
    readonly order?: { readonly "error: GPU kernels have no order yet": true };
};

/**
 * An observer system only reads, after a sync point: its row and resources are read-only, and it never compiles to a
 * kernel, has no `up`, and is ordered with nothing. That it takes no input is checked at its body.
 */
type Observer = {
    readonly kernel?: false;
    readonly up?: never;
    readonly before?: never;
    readonly after?: never;
    readonly during?: never;
};

/** A system on one entity runs on its row, in no order; that its target is an entity field of its input is checked at its body. */
type Targeted = {
    readonly kernel?: false;
    readonly up?: never;
    readonly order?: never;
};

type Validate<D extends Declaration> =
    LookupChanges<D>
    & Conditions<D>
    & Inferred
    & (D extends { readonly kernel: "gpu" } ? GpuKernel : {})
    // `up` and `order` order rows, so a system without them has neither, and one has at most one of them.
    & (Property<D, "components"> extends undefined ? {
        readonly up?: { readonly [key: string]: never };
        readonly order?: { readonly "error: a system without components runs once, in no order": true };
        readonly kernel?: false | { readonly "error: a system without components runs once, so there's nothing to compile": true };
    } : {})
    & (D extends { readonly up: object } ? { readonly order?: { readonly "error: up and order both decide the order of its rows": true } } : {})
    & (D extends { readonly observer: true } ? Observer : {})
    & (D extends { readonly target: string } ? Targeted : {})
    & (D extends { readonly target: string } ? Property<D, "components"> extends undefined ? { readonly target?: { readonly "error: a system on one entity runs on its row, so it needs components": true } } : {} : {})
    // A body's input is the type of its parameter after its context, not part of its declaration.
    & { readonly shader?: never; readonly input?: never };

/** The fields of input `I` that hold an entity. */
type EntityFields<I> = { [K in keyof I]-?: [Exclude<I[K], undefined>] extends [Entity] ? K : never }[keyof I] & string;

/**
 * What a declaration requires of the input its body takes, checked at the body, since the input is known only once the
 * body is: a target names an entity field of it, and a system with input doesn't filter on added or changed, as its
 * runs pass different input, nor is it an observer. Every check passes for `never`, the input before the body is
 * inferred.
 */
type Checks<D, I> = [I] extends [never] ? unknown :
    (D extends { readonly target: infer T extends string }
        ? [I] extends [undefined] ? { readonly "error: a system with a target takes its input after its context": T }
        : T extends EntityFields<I> ? unknown : { readonly "error: its target is no entity field of its input": T }
        : unknown)
    & ([I] extends [undefined] ? unknown
        : (D extends { readonly components: { readonly added: object } | { readonly changed: object } } ? { readonly "error: a system with input can't filter on added or changed, as its runs pass different input; pass it through a resource": true } : unknown)
        & (D extends { readonly observer: true } ? { readonly "error: an observer system takes no input": true } : unknown));

/** The body of a system that declares nothing, which runs once per run with its resources and commands. */
type Alone = (context: Context<{}>) => void;

/** A composite: its list of members, or its declaration. */
type Composition = readonly System<unknown>[] | CompositeDeclaration;

/** A composite's members. */
type MembersOf<C> = C extends CompositeDeclaration ? C["systems"] : C;

/** A member whose input has a field of a different type than another member's becomes the error saying so. */
type Checked<C> = C extends Alone ? unknown : C extends CompositeDeclaration ? { readonly systems: CheckMembers<C["systems"]> } : CheckMembers<C>;

/**
 * Declares a system and returns it; nothing runs. The arguments tell the forms apart:
 * - `create(body)`: a system that declares nothing, whose body runs once per run with its resources and commands.
 * - `create(declaration, body)`: a system.
 * - `create([move, collide])`: a composite of the systems listed, which may live on different threads.
 * - `create({ systems: [move, collide], after: [input] })`: a composite with constraints.
 *
 * What a body reads, writes and reduces into the build infers from it. Each run passes a composite's members one
 * input, with every field of theirs. Throws if a system names a key that isn't registered as its kind, its body writes
 * a reference, a lookup's rows are read where it writes them or it goes through an index keyed by what it writes, its
 * rows are ordered by an index it isn't sorted or keyed by what it writes, its object components and resources live on
 * different threads, or its reductions, conditions, `up`, `order` or placement can't hold, or it's an observer and
 * writes, reduces, takes input, is a kernel, has `up` or is ordered; if the build couldn't follow how its body uses its
 * resources, lookups or parent; or if a composite's member isn't a system a constructor returned, or two members
 * declare an input field with different schemas. A composite's observer members run after its sync point, ordered
 * with nothing.
 *
 * One argument, a body or a composite, is one overload, so a mistake in it is reported where it is rather than as no
 * overload matching.
 */
export function create<const D extends Declaration, B extends Body<D, never>>(declaration: D & Validate<D> & OneThread<ThreadsOf<D>, ThreadedBy<D>>, body: B & Checks<D, InputOf<D, B>>): System<InputOf<D, B>>;
export function create<const C extends Alone | Composition>(only: C & Checked<C>): C extends Alone ? System : System<CompositeInputOf<MembersOf<C>>>;
// The plugin passes the schema of the body's input as a third argument.
export function create(first: Declaration | Leaf["body"] | readonly System<unknown>[] | CompositeDeclaration, second?: Leaf["body"], input?: unknown): System<unknown> {
    // The plugin gives its id to the call's first argument: the declaration, the members, or the body made into a
    // system alone.
    const id = takeIdOfDeclaration(first);
    if (isList(first)) return compose(first, { systems: first }, id);
    if (typeof first !== "function" && second === undefined && "systems" in first) return compose(first, first, id);
    const declared: Declaration = typeof first === "function" ? {} : first;
    const body = typeof first === "function" ? first : second;
    if (body === undefined) throw new Error("A system needs a body, and a composite its systems.");
    const name = nameOf(first, id, "system");
    const declaration = resolve(`System "${name}"`, declared, accessOf(`System "${name}"`, first));
    const schema = inputSchemaOf(name, body, declaration.components === undefined ? 1 : 2, input);
    const system: Leaf & System<unknown> = { kind: "system", name, declaration, input: schema, body };
    checkLeaf(system);
    claimSystem(system, id);
    return system;
}

/** A declaration as the world takes it, with what the build inferred its body uses. */
const resolve = (what: string, declared: Declaration, access: ReturnType<typeof accessOf>): Resolved => {
    const reading = declared.observer === true;
    const { components, lookup, up, resources, ...rest } = declared;
    const uses = resourceUses(what, access, resources?.is);
    const resolved: Resolved = {
        ...rest,
        ...components === undefined ? {} : { components: componentLists(components, access.components, reading) },
        ...lookup === undefined ? {} : { lookup: lookupsLists(lookup, access) },
        ...up === undefined ? {} : { up: { through: up.through, read: upReads(what, access) } },
    };
    const lists = compact({ read: uses.read, write: uses.write, reduce: uses.reduce, changed: resources?.changed, is: resources?.is, not: resources?.not });
    return Object.keys(lists).length === 0 ? resolved : { ...resolved, resources: lists };
};

const isList = (value: unknown): value is readonly System<unknown>[] => Array.isArray(value);

/** A composite of `declaration`, labeled by `first`, the argument the plugin labeled. */
const compose = (first: object, declaration: CompositeDeclaration, id: string | undefined): System<unknown> => {
    const system: Composite & System<unknown> = { kind: "composite", name: nameOf(first, id, "system"), declaration };
    checkComposite(system);
    claimSystem(system, id);
    return system;
};
