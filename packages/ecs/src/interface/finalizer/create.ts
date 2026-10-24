// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationOf, kindOf, labelOf, whyUnregistered } from '../registry/names.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { firstItemOf, nameOf } from '../registry/items.js';
import { addFinalizer, programFinalizers } from '../registry/program.js';
import { requireRegistered, threadOf } from '../registry/threads.js';
import { checkWorldWritten } from '../registry/written.js';
import { checkLookup } from '../registry/indexes.js';
import type { Listed, Property } from '../system/property.js';
import type { ThreadOfComponent } from '../component/value.js';
import type { Component } from '../component/component.js';
import type { Elsewhere, OneThread, ThreadedBy, ThreadsOf } from '../system/threads.js';
import type { ChangeSet, Context, Row, Watched } from './body.js';
import type { Changes, Leaf } from './created.js';
import type { ChangesDeclaration, Declaration, Resolved, ResolvedChanges } from './declaration.js';
import { accessOf, compact, lookupsLists, resourceUses, type Access } from '../system/resolve.js';
import type { Finalizer } from './finalizer.js';
import type { Finalizer as Registered } from './created.js';

/**
 * A finalizer on another thread than the world's runs there after the sync point, which doesn't wait for it: it looks
 * up nothing, and, which registration checks, writes no resources.
 */
type Remote<D> = true extends Elsewhere<ThreadsOf<D>>
    ? ([keyof Property<D, "lookup">] extends [never] ? {} : { readonly "error: a finalizer on another thread than the world's looks up nothing": true })
    : {};

/** A changes finalizer runs on the world's thread, in the sync point: it watches and reads no other thread's objects. */
type OnWorld<D> = true extends Elsewhere<ThreadsOf<D> | ThreadOfComponent<Listed<D, "watch"> & Component.Key>>
    ? { readonly "error: a changes finalizer watches and reads only the world's thread's objects": true }
    : {};

type Key = symbol;

/** What a finalizer's body reads of its row and lookups, and reads and writes of resources, is inferred. */
type Inferred = { readonly resources?: never };

/** What every finalizer's declaration holds as the world takes it: its lookups' and resources' lists from what the build inferred. */
const resolveShared = (what: string, declared: Declaration | ChangesDeclaration, access: Access) => {
    const uses = resourceUses(what, access, undefined);
    if (uses.reduce.length > 0) throw new Error(`${what} reduces into resources; only systems contribute to a reduction.`);
    const lookup = lookupsLists(declared.lookup, access);
    return {
        ...lookup === undefined ? {} : { lookup },
        resources: compact({ read: uses.read, write: uses.write }),
        ...declared.before === undefined ? {} : { before: declared.before },
        ...declared.after === undefined ? {} : { after: declared.after },
    };
};

/** A finalizer's row lists: what its body reads, the rest of `with` only required. */
const componentReads = (components: Declaration["components"], access: Access): Resolved["components"] => {
    const read = access.components?.read ?? components.with ?? [];
    return compact({ read, has: (components.with ?? []).filter(key => !read.includes(key)), not: components.not });
};

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

/** The thread a registered finalizer runs on: a changes finalizer, and one using no objects, on the world's. */
const runsOn = (finalizer: Registered): string => finalizer.kind === "finalizer" ? threadOf(finalizer.declaration, "Finalizer", finalizer.name) ?? "world" : "world";

/** Throws for a finalizer ordered with one on another thread: they run at different times. */
const checkOrder = (name: string, thread: string, declaration: { readonly before?: readonly Finalizer[]; readonly after?: readonly Finalizer[] }): void => {
    for (const other of [...declaration.before ?? [], ...declaration.after ?? []]) {
        const first = firstItemOf(other);
        const found = programFinalizers().find(finalizer => firstItemOf(finalizer) === first);
        if (found === undefined) continue;
        const theirs = runsOn(found);
        if (theirs !== thread) {
            throw new Error(`Finalizer "${name}" runs on thread "${thread}" and is ordered with "${found.name}", which runs on thread "${theirs}"; finalizers on different threads run at different times, so neither is ordered before the other.`);
        }
    }
};

/**
 * Declares a finalizer for each entity that stops matching its components, which applies in every world, and returns
 * it. It runs on the thread its object components and resources live on: on another than the world's, after the sync
 * point, issuing no commands. Throws if it names a component or resource that isn't registered as one, lists a
 * resource in both `read` and `write`, writes a reduced one, uses object values of different threads, writes resources
 * or looks up entities on another thread than the world's, or is ordered with a finalizer on another thread, in a cycle
 * or with a resource conflict.
 */
export const create = <const D extends Declaration>(
    declared: D & Inferred & { readonly components: { readonly read?: never; readonly has?: never } } & OneThread<ThreadsOf<D>, ThreadedBy<D>> & Remote<D>,
    body: (row: Row<D>, context: Context<D>) => void,
): Finalizer => {
    const id = takeIdOfDeclaration(declared);
    const name = nameOf(declared, id, "finalizer");
    const what = `Finalizer "${name}"`;
    const access = accessOf(what, declared);
    const declaration: Resolved = {
        ...resolveShared(what, declared, access),
        components: componentReads(declared.components, access),
    };
    const finalizer: Leaf = { kind: "finalizer", name, declaration, body };
    checkResources(name, declaration.resources);
    const thread = threadOf(declaration, "Finalizer", name);
    if (thread !== null && thread !== "world") {
        const elsewhere = `one on another thread than the world's runs after the sync point, so it`;
        if ((declaration.resources?.write?.length ?? 0) > 0) throw new Error(`Finalizer "${name}" runs on thread "${thread}" and writes resources; ${elsewhere} writes none.`);
        if (Object.keys(declaration.lookup ?? {}).length > 0) throw new Error(`Finalizer "${name}" runs on thread "${thread}" and looks up other entities; ${elsewhere} looks up none.`);
    }
    checkOrder(name, thread ?? "world", declaration);
    requireRegistered("Finalizer", name, "component", declaration.components.has);
    requireRegistered("Finalizer", name, "component", declaration.components.not);
    for (const lookupName in declaration.lookup) {
        checkLookup("Finalizer", name, lookupName, declaration.lookup[lookupName]);
        const lookup = declaration.lookup[lookupName];
        requireRegistered("Finalizer", name, "component", "has" in lookup ? lookup.has : undefined);
        requireRegistered("Finalizer", name, "component", "not" in lookup ? lookup.not : undefined);
    }
    return addFinalizer(finalizer, id);
};

/**
 * Declares a finalizer of each sync point's structural changes, which applies in every world, and returns it. It runs
 * on the world's thread. Throws as `create` does, for a watched component that isn't registered or is derived, and for
 * one watching or reading another thread's values.
 */
export const changes = <const D extends ChangesDeclaration>(
    declared: D & Inferred & OnWorld<D>,
    body: (changes: ChangeSet<Watched<D>>, context: Context<D>) => void,
): Finalizer => {
    const id = takeIdOfDeclaration(declared);
    const name = nameOf(declared, id, "finalizer");
    const what = `Finalizer "${name}"`;
    const declaration: ResolvedChanges = { ...resolveShared(what, declared, accessOf(what, declared)), ...declared.watch === undefined ? {} : { watch: declared.watch } };
    const finalizer: Changes = { kind: "changes", name, declaration, body };
    checkResources(name, declaration.resources);
    requireRegistered("Finalizer", name, "resource", declaration.resources?.read);
    requireRegistered("Finalizer", name, "resource", declaration.resources?.write);
    for (const lookupName in declaration.lookup) {
        const lookup = declaration.lookup[lookupName];
        checkLookup("Finalizer", name, lookupName, lookup);
        for (const keys of [lookup.read, "has" in lookup ? lookup.has : undefined, "not" in lookup ? lookup.not : undefined]) requireRegistered("Finalizer", name, "component", keys);
    }
    for (const key of declaration.watch ?? []) {
        if (kindOf(key) !== "component") throw new Error(`Finalizer "${name}" watches "${labelOf(key)}", which isn't a registered component: ${whyUnregistered(key)}.`);
        if (declarationOf(key)?.derived === true) throw new Error(`Finalizer "${name}" watches "${labelOf(key)}", which is derived; it sees only components user code adds and removes.`);
    }
    const thread = threadOf({ components: { read: declaration.watch }, resources: declaration.resources, lookup: declaration.lookup }, "Finalizer", name);
    if (thread !== null && thread !== "world") throw new Error(`Finalizer "${name}" watches or reads values on thread "${thread}"; a changes finalizer runs on the world's thread, in the sync point.`);
    checkOrder(name, "world", declaration);
    return addFinalizer(finalizer, id);
};
