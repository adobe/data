import type { Component } from '../component/component.js';
import { claim } from '../registry/program.js';
import type { Resource } from '../resource/resource.js';
import type { Schema } from '../schema/schema.js';
import type { Body } from './body.js';
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

type Reduced<D extends Declaration> = keyof Property<D, "reduce"> & Resource.Key;
type Written<D, K extends "components" | "resources"> = Listed<Property<D, K>, "write">;
type Is<D> = Listed<Property<D, "resources">, "is">;

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
    readonly lookup?: { readonly [name: string]: { readonly read?: readonly StructComponent[] } };
    readonly up?: { readonly read?: readonly StructComponent[] };
    readonly resources?: { readonly read?: readonly StructResource[]; readonly write?: never };
};

/** What a GPU kernel can't use yet, beyond any kernel's limits. */
type GpuKernel = {
    readonly lookup?: { readonly [name: string]: never };
    readonly components?: { readonly added?: never; readonly changed?: never };
    readonly resources?: { readonly changed?: never };
    readonly reduce?: { readonly [K in Resource.Key]?: never };
};

type Validate<D extends Declaration> =
    Lists<D>
    & (D extends { readonly input: Schema } ? { readonly components?: { readonly added?: never; readonly changed?: never } } : {})
    & (D extends { readonly kernel: "cpu" | "gpu" } ? Kernel : {})
    & (D extends { readonly kernel: "gpu" } ? GpuKernel : {})
    // `up` orders rows, so a system without them has none.
    & (Property<D, "components"> extends undefined ? { readonly up?: { readonly [key: string]: never } } : {})
    & { readonly shader?: never };

/**
 * Declares a system and returns it; nothing runs. Throws if it lists a key in both `read` and `write`, a lookup reads a
 * component it writes, or its object components and resources live on different threads.
 */
export const create = <const D extends Declaration>(declaration: D & Validate<D> & OneThread<ThreadsOf<D>>, body: Body<D>): System<InputOf<D>> => {
    const system: Leaf & System<InputOf<D>> = { kind: "system", name: declaration.name, declaration, body };
    checkLeaf(system);
    claim(system);
    return system;
};

/**
 * Declares a system made of subsystems, which may live on different threads, and returns it. Throws if a member isn't
 * a system a constructor returned, or two members declare an input field with different schemas.
 */
export const composite = <const D extends CompositeDeclaration>(declaration: D & { readonly systems: CheckMembers<D["systems"]> }): System<CompositeInputOf<D["systems"]>> => {
    const system: Composite & System<CompositeInputOf<D["systems"]>> = { kind: "composite", name: declaration.name, declaration };
    checkComposite(system);
    claim(system);
    return system;
};
