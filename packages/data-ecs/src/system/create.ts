import type { Component } from '../component/component.js';
import { claim, systemNamed } from '../world/create/program.js';
import { scheduleOf } from '../world/create/schedule.js';
import type { Resource } from '../resource/resource.js';
import type { Schema } from '../schema/schema.js';
import type { Body } from './body.js';
import type { Composite, CompositeDeclaration } from './composite.js';
import type { Leaf } from './leaf.js';
import type { Declaration } from './declaration.js';
import type { InputOf } from './input.js';
import type { LinearComponent, LinearResource } from './linear.js';
import type { Name } from './name.js';
import type { System } from './system.js';
import type { Listed, Property } from './property.js';

type Ordering<N> = {
    readonly before?: readonly System<Exclude<Name, N>, unknown>[];
    readonly after?: readonly System<Exclude<Name, N>, unknown>[];
    readonly during?: readonly System<Exclude<Name, N>, unknown>[];
};

type Reduced<D extends Declaration> = keyof Property<D, "reduce"> & Resource.Name;
type Written<D, K extends "components" | "resources"> = Listed<Property<D, K>, "write">;

/**
 * A key in `write` is readable too, so it isn't also in `read`. A system doesn't read or filter on what it reduces
 * into, since the fold is only finished after every contributor runs.
 */
type Lists<D extends Declaration> = {
    readonly components?: { readonly read?: readonly Exclude<Component.Name, Written<D, "components">>[] };
    readonly resources?: {
        readonly read?: readonly Exclude<Resource.Name, Written<D, "resources"> | Reduced<D>>[];
        readonly changed?: readonly Exclude<Resource.Name, Reduced<D>>[];
    };
};

type Kernel = {
    readonly components?: { readonly read?: readonly LinearComponent[]; readonly write?: readonly LinearComponent[] };
    readonly lookup?: { readonly [name: string]: { readonly read?: readonly LinearComponent[] } };
    readonly resources?: { readonly read?: readonly LinearResource[]; readonly write?: never };
};

/** What a GPU kernel can't use yet, beyond any kernel's limits. */
type GpuKernel = {
    readonly lookup?: { readonly [name: string]: never };
    readonly components?: { readonly added?: never; readonly changed?: never };
    readonly resources?: { readonly changed?: never };
    readonly reduce?: { readonly [K in Resource.Name]?: never };
};

type Validate<D extends Declaration> =
    Ordering<D["name"]>
    & Lists<D>
    & (D extends { readonly input: Schema } ? { readonly components?: { readonly added?: never; readonly changed?: never } } : {})
    & (D extends { readonly kernel: "cpu" | "gpu" } ? Kernel : {})
    & (D extends { readonly kernel: "gpu" } ? GpuKernel : {})
    & { readonly shader?: never };

/** Declares a system, findable by name with `get`; nothing runs. Throws if a different one has its name. */
export const create = <const D extends Declaration>(declaration: D & Validate<D>, body: Body<D>): System<D["name"], InputOf<D>> => {
    const system: Leaf & System<D["name"], InputOf<D>> = { kind: "system", name: declaration.name, declaration, body };
    claim(system);
    return system;
};

/**
 * Declares a system made of subsystems, findable by name with `get`. Throws if a different one has its name, its
 * members are ordered in a cycle, or two of them conflict with no order between them.
 */
export const composite = <const D extends CompositeDeclaration>(declaration: D & Ordering<D["name"]>): System<D["name"]> => {
    const system: Composite & System<D["name"]> = { kind: "composite", name: declaration.name, declaration };
    scheduleOf(system);
    claim(system);
    return system;
};

/** A system by name, with whatever input it takes. */
export const get = (name: Name): System<Name, unknown> | null => {
    return systemNamed(name);
};
