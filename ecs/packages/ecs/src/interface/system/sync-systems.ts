// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationOf, kindOf, labelOf, whyUnregistered } from '../registry/names.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { nameOf } from '../registry/items.js';
import { claimSyncSystem, syncSystemOf } from '../registry/program.js';
import { requireRegistered, threadOf } from '../registry/threads.js';
import { checkWorldWritten } from '../registry/written.js';
import { checkLookup } from '../registry/indexes.js';
import type { Property } from './property.js';
import type { ThreadOfComponent } from '../component/value.js';
import type { ThreadOfResource } from '../resource/value.js';
import type { Resource } from '../resource/resource.js';
import type { Component } from '../component/component.js';
import type { Elsewhere, OneThread, ThreadedBy, ThreadsOf } from './threads.js';
import type { ChangeSet, Context, Row, Watched, WatchedResources, WatchListed } from './sync-system-body.js';
import type { ChangesDeclaration, Declaration, SyncSystemValue } from './sync-system-declaration.js';
import type { ChangesSystem, RemovedSystem, Resolved, ResolvedChanges } from './sync-system.js';
import { accessOf, compact, lookupsLists, resourceUses, type Access } from './resolve.js';
import type { System } from './system.js';

/**
 * A removed system on another thread than the world's runs there after the sync point, which doesn't wait for it: it
 * looks up nothing, and, which its constructor checks, writes no resources.
 */
type Remote<D> = true extends Elsewhere<ThreadsOf<D>>
    ? ([keyof Property<D, "lookup">] extends [never] ? {} : { readonly "error: a removed system on another thread than the world's looks up nothing": true })
    : {};

/** A changes system runs on the world's thread, in the sync point: it watches and reads no other thread's objects. */
type OnWorld<D extends ChangesDeclaration> = true extends Elsewhere<ThreadsOf<D> | ThreadOfComponent<Extract<WatchListed<D, "components">, Component.Key>> | ThreadOfResource<Extract<WatchListed<D, "resources">, Resource.Key>>>
    ? { readonly "error: a changes system watches and reads only the world's thread's objects": true }
    : {};

type Key = symbol;

/** What its body reads of its row and lookups, and reads and writes of resources, is inferred. */
type Inferred = { readonly resources?: never };

/** What every changes and removed system's declaration holds as the world takes it: its lookups' and resources' lists from what the build inferred. */
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

/** A removed system's row lists: what its body reads, the rest of `with` only required. Throws for a body writing its row, which holds values from before. */
const componentReads = (what: string, components: Declaration["components"], access: Access): Resolved["components"] => {
    const written = access.components?.write[0];
    if (written !== undefined) throw new Error(`${what} writes "${labelOf(written)}" of its row, which is read-only: it holds the values from before the entity stopped matching.`);
    // Optional components are read where the entity had them, and never decide a stop.
    const optional = (components.optional ?? []).filter(key => !(components.with ?? []).includes(key));
    const read = access.components?.read ?? [...components.with ?? [], ...optional];
    return compact({ read, has: (components.with ?? []).filter(key => !read.includes(key)), optional, not: components.not });
};

/** Throws if a resource is in both `read` and `write`, or a reduced one is written. */
const checkResources = (what: string, resources: { readonly read?: readonly Key[]; readonly write?: readonly Key[] } | undefined): void => {
    const writes = new Set(resources?.write);
    const both = (resources?.read ?? []).find(key => writes.has(key));
    if (both !== undefined) throw new Error(`${what} lists "${labelOf(both)}" in both resources read and write; write already makes it readable.`);
    checkWorldWritten(what, resources?.write);
    for (const key of writes) {
        if (declarationOf(key)?.reduce !== undefined) throw new Error(`${what} writes "${labelOf(key)}", which is reduced; only its contributors' fold sets it.`);
    }
};

/** Throws for `before` or `after` naming what isn't a changes or removed system: only those run in sync points. */
const checkOrdered = (what: string, declaration: { readonly before?: readonly SyncSystemValue[]; readonly after?: readonly SyncSystemValue[] }): void => {
    for (const other of [...declaration.before ?? [], ...declaration.after ?? []]) {
        if (syncSystemOf(other) === undefined) throw new Error(`${what} is ordered with "${String(other.name)}", which isn't a changes or removed system; those are ordered only with each other.`);
    }
};

/**
 * Declares a removed system and returns it; nothing runs. Added to a world, from its next sync point on it runs for
 * each entity that stops matching its components, inside the sync point, before it applies; and once removed, or the
 * world disposed, for each entity it still matches. It runs on the thread its object components and resources live
 * on: on another than the world's, after the sync point, issuing no commands. `run` doesn't take it. Throws if it
 * names a component or resource that isn't registered as one, lists a resource in both `read` and `write`, writes a
 * reduced one, uses object values of different threads, writes resources or looks up entities on another thread than
 * the world's, or is ordered with what isn't a changes or removed system.
 */
export const removed = <const D extends Declaration>(
    declared: D & Inferred & { readonly components: { readonly read?: never; readonly has?: never } } & OneThread<ThreadsOf<D>, ThreadedBy<D>> & Remote<D>,
    body: (row: Row<D>, context: Context<D>) => void,
): System<never> => {
    const id = takeIdOfDeclaration(declared);
    const name = nameOf(declared, id, "system");
    const what = `Removed system "${name}"`;
    const access = accessOf(what, declared);
    const declaration: Resolved = {
        ...resolveShared(what, declared, access),
        components: componentReads(what, declared.components, access),
    };
    const syncSystem: RemovedSystem = { kind: "removed", name, declaration, body };
    checkResources(what, declaration.resources);
    const thread = threadOf(declaration, "Removed system", name);
    if (thread !== null && thread !== "world") {
        const elsewhere = `one on another thread than the world's runs after the sync point, so it`;
        if ((declaration.resources?.write?.length ?? 0) > 0) throw new Error(`${what} runs on thread "${thread}" and writes resources; ${elsewhere} writes none.`);
        if (Object.keys(declaration.lookup ?? {}).length > 0) throw new Error(`${what} runs on thread "${thread}" and looks up other entities; ${elsewhere} looks up none.`);
    }
    checkOrdered(what, declaration);
    requireRegistered("Removed system", name, "component", declaration.components.has);
    requireRegistered("Removed system", name, "component", declaration.components.not);
    for (const lookupName in declaration.lookup) {
        checkLookup("Removed system", name, lookupName, declaration.lookup[lookupName]);
        const lookup = declaration.lookup[lookupName];
        requireRegistered("Removed system", name, "component", "has" in lookup ? lookup.has : undefined);
        requireRegistered("Removed system", name, "component", "not" in lookup ? lookup.not : undefined);
    }
    return claimSyncSystem(syncSystem, id);
};

const isList = (watch: NonNullable<ChangesDeclaration["watch"]>): watch is Extract<ChangesDeclaration["watch"], readonly unknown[]> => Array.isArray(watch);

/** What a changes system watches, sorted by kind. Throws for a key that's neither of the kinds it's listed as, or derived. */
const watchOf = (what: string, watch: ChangesDeclaration["watch"]): ResolvedChanges["watch"] => {
    const components: symbol[] = [];
    const componentTraits: symbol[] = [];
    const resources: symbol[] = [];
    const resourceTraits: symbol[] = [];
    const sort = (key: unknown, kinds: readonly ("component" | "resource")[]): void => {
        const kind = kindOf(key);
        if (typeof key !== "symbol" || kind === undefined || (kind !== "trait" && !kinds.includes(kind))) {
            const among = kinds.length === 2 ? "" : ` among its ${kinds[0]}s`;
            throw new Error(`${what} watches "${labelOf(key)}"${among}, which isn't a registered ${kinds.length === 2 ? "component, resource" : kinds[0]} or trait: ${whyUnregistered(key)}.`);
        }
        if (kind === "trait") {
            if (kinds.includes("component")) componentTraits.push(key);
            if (kinds.includes("resource")) resourceTraits.push(key);
            return;
        }
        if (declarationOf(key)?.derived === true) throw new Error(`${what} watches "${labelOf(key)}", which is derived; it sees only components user code adds and removes.`);
        (kind === "component" ? components : resources).push(key);
    };
    if (watch === undefined) return { components: true, componentTraits, resources, resourceTraits };
    if (isList(watch)) {
        for (const key of watch) sort(key, ["component", "resource"]);
        return { components, componentTraits, resources, resourceTraits };
    }
    const every = watch.components === true;
    if (!every) for (const key of watch.components) sort(key, ["component"]);
    for (const key of watch.resources) sort(key, ["resource"]);
    return { components: every ? true : components, componentTraits: every ? [] : componentTraits, resources, resourceTraits };
};

/**
 * Declares a changes system and returns it; nothing runs. Added to a world, from its next sync point on it runs in
 * each sync point, before it applies, with its structural changes to the components it watches, the resources it
 * watches written since its last one, and the components it watches written through rows since then. A row write of a
 * watched component makes a sync point due, so a run writing only that still reports it. It runs on the world's thread. `run` doesn't take it. Throws as `removed`
 * does, for a watched component that isn't registered or is derived, a watched key that's neither a component nor a
 * resource, and for one watching or reading another thread's values.
 */
export const changes = <const D extends ChangesDeclaration>(
    declared: D & Inferred & OnWorld<D>,
    body: (changes: ChangeSet<Watched<D>, WatchedResources<D>>, context: Context<D>) => void,
): System<never> => {
    const id = takeIdOfDeclaration(declared);
    const name = nameOf(declared, id, "system");
    const what = `Changes system "${name}"`;
    const declaration: ResolvedChanges = { ...resolveShared(what, declared, accessOf(what, declared)), watch: watchOf(what, declared.watch) };
    const syncSystem: ChangesSystem = { kind: "changes", name, declaration, body };
    checkResources(what, declaration.resources);
    requireRegistered("Changes system", name, "resource", declaration.resources?.read);
    requireRegistered("Changes system", name, "resource", declaration.resources?.write);
    for (const lookupName in declaration.lookup) {
        const lookup = declaration.lookup[lookupName];
        checkLookup("Changes system", name, lookupName, lookup);
        for (const keys of [lookup.read, "has" in lookup ? lookup.has : undefined, "not" in lookup ? lookup.not : undefined]) requireRegistered("Changes system", name, "component", keys);
    }
    const { watch } = declaration;
    const read = [...declaration.resources?.read ?? [], ...watch.resources];
    const thread = threadOf({ components: { read: watch.components === true ? [] : watch.components }, resources: { ...declaration.resources, read }, lookup: declaration.lookup }, "Changes system", name);
    if (thread !== null && thread !== "world") throw new Error(`${what} watches or reads values on thread "${thread}"; a changes system runs on the world's thread, in the sync point.`);
    checkOrdered(what, declaration);
    return claimSyncSystem(syncSystem, id);
};
