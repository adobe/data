import { declarationOf, kindOf, labelOf } from '../registry/names.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { nameOf } from '../registry/items.js';
import { addFinalizer } from '../registry/program.js';
import { requireRegistered, threadOf } from '../registry/threads.js';
import { checkWorldWritten } from '../registry/written.js';
import type { Resource } from '../resource/resource.js';
import type { Listed, Property } from '../system/property.js';
import type { ThreadOfComponent } from '../component/value.js';
import type { Component } from '../component/component.js';
import type { Elsewhere, OneThread, ThreadsOf } from '../system/threads.js';
import type { ChangeSet, Context, Row, Watched } from './body.js';
import type { Changes, Leaf } from './created.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';
import type { Finalizer } from './finalizer.js';

/** A resource in `write` is readable too, so it isn't also in `read`. */
type Validate<D extends Declaration | ChangesDeclaration> =
    { readonly resources?: { readonly read?: readonly Exclude<Resource.Key, Listed<Property<D, "resources">, "write">>[] } };

/**
 * A finalizer on another thread than the world's runs there after the sync point, which doesn't wait for it: it writes
 * no resources and looks up nothing.
 */
type Remote<D> = true extends Elsewhere<ThreadsOf<D>>
    ? ([Listed<Property<D, "resources">, "write">] extends [never] ? {} : { readonly "error: a finalizer on another thread than the world's writes no resources": true })
    & ([keyof Property<D, "lookup">] extends [never] ? {} : { readonly "error: a finalizer on another thread than the world's looks up nothing": true })
    : {};

/** A changes finalizer runs on the world's thread, in the sync point: it watches and reads no other thread's objects. */
type OnWorld<D> = true extends Elsewhere<ThreadsOf<D> | ThreadOfComponent<Listed<D, "watch"> & Component.Key>>
    ? { readonly "error: a changes finalizer watches and reads only the world's thread's objects": true }
    : {};

type Key = symbol;

/** Throws if a resource is in both `read` and `write`, or a reduced one is written. */
const checkResources = (name: string, resources: { readonly read?: readonly Key[]; readonly write?: readonly Key[] } | undefined): void => {
    const writes = new Set(resources?.write);
    const both = (resources?.read ?? []).find(key => writes.has(key));
    if (both !== undefined) throw new Error(`Finalizer "${name}" lists "${labelOf(both)}" in both resources read and write; write already makes it readable.`);
    checkWorldWritten(`Finalizer "${name}"`, resources?.write);
    for (const key of writes) {
        if (declarationOf(key)?.reduce !== undefined) throw new Error(`Finalizer "${name}" writes "${labelOf(key)}", which is reduced; only its contributors' fold sets it.`);
    }
};

/**
 * Declares a finalizer for each entity that stops matching its components, which applies in every world, and returns
 * it. It runs on the thread its object components and resources live on. Throws if it names a component or resource
 * that isn't registered as one, lists a resource in both `read` and `write`, writes a reduced one, uses object values
 * of different threads, or is ordered in a cycle or with a resource conflict.
 */
export const create = <const D extends Declaration>(
    declaration: D & Validate<D> & OneThread<ThreadsOf<D>> & Remote<D>,
    body: (row: Row<D>, context: Context<D>) => void,
): Finalizer => {
    const id = takeIdOfDeclaration(declaration);
    const name = nameOf(declaration.name, id, "finalizer");
    const finalizer: Leaf<D> = { kind: "finalizer", name, declaration, body };
    checkResources(name, declaration.resources);
    threadOf(declaration, "Finalizer", name);
    requireRegistered("Finalizer", name, "component", declaration.components.has);
    requireRegistered("Finalizer", name, "component", declaration.components.not);
    for (const lookupName in declaration.lookup) {
        requireRegistered("Finalizer", name, "component", declaration.lookup[lookupName].has);
        requireRegistered("Finalizer", name, "component", declaration.lookup[lookupName].not);
    }
    return addFinalizer(finalizer, id);
};

/**
 * Declares a finalizer of each sync point's structural changes, which applies in every world, and returns it. Throws
 * as `create` does, and for a watched component that isn't registered or is derived.
 */
export const changes = <const D extends ChangesDeclaration>(
    declaration: D & Validate<D> & OnWorld<D>,
    body: (changes: ChangeSet<Watched<D>>, context: Context<D>) => void,
): Finalizer => {
    const id = takeIdOfDeclaration(declaration);
    const name = nameOf(declaration.name, id, "finalizer");
    const finalizer: Changes<D> = { kind: "changes", name, declaration, body };
    checkResources(name, declaration.resources);
    requireRegistered("Finalizer", name, "resource", declaration.resources?.read);
    requireRegistered("Finalizer", name, "resource", declaration.resources?.write);
    for (const lookupName in declaration.lookup) {
        const { read, has, not } = declaration.lookup[lookupName];
        for (const keys of [read, has, not]) requireRegistered("Finalizer", name, "component", keys);
    }
    for (const key of declaration.watch ?? []) {
        if (kindOf(key) !== "component") throw new Error(`Finalizer "${name}" watches "${labelOf(key)}", which isn't a registered component.`);
        if (declarationOf(key)?.derived === true) throw new Error(`Finalizer "${name}" watches "${labelOf(key)}", which is derived; it sees only components user code adds and removes.`);
    }
    return addFinalizer(finalizer, id);
};
