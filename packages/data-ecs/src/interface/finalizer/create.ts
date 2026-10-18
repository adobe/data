import { declarationOf, kindOf, labelOf } from '../registry/names.js';
import { addFinalizer } from '../registry/program.js';
import { threadOf } from '../registry/threads.js';
import { checkWorldWritten } from '../registry/written.js';
import type { Resource } from '../resource/resource.js';
import type { Listed, Property } from '../system/property.js';
import type { OneThread, ThreadsOf } from '../system/threads.js';
import type { ChangeSet, Context, Row, Watched } from './body.js';
import type { Changes, Leaf } from './created.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';
import type { Finalizer } from './finalizer.js';

/** A resource in `write` is readable too, so it isn't also in `read`. */
type Validate<D extends Declaration | ChangesDeclaration> =
    { readonly resources?: { readonly read?: readonly Exclude<Resource.Key, Listed<Property<D, "resources">, "write">>[] } };

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
 * it. It runs on the thread its object components and resources live on. Throws if it lists a resource in both `read`
 * and `write`, writes a reduced one, uses object values of different threads, or is ordered in a cycle or with a
 * resource conflict.
 */
export const create = <const D extends Declaration>(
    declaration: D & Validate<D> & OneThread<ThreadsOf<D>>,
    body: (row: Row<D>, context: Context<D>) => void,
): Finalizer => {
    const finalizer: Leaf<D> = { kind: "finalizer", name: declaration.name, declaration, body };
    checkResources(declaration.name, declaration.resources);
    threadOf(declaration, "Finalizer");
    return addFinalizer(finalizer);
};

/**
 * Declares a finalizer of each sync point's structural changes, which applies in every world, and returns it. Throws
 * as `create` does, and for a watched component that isn't registered or is derived.
 */
export const changes = <const D extends ChangesDeclaration>(
    declaration: D & Validate<D>,
    body: (changes: ChangeSet<Watched<D>>, context: Context<D>) => void,
): Finalizer => {
    const finalizer: Changes<D> = { kind: "changes", name: declaration.name, declaration, body };
    checkResources(declaration.name, declaration.resources);
    for (const key of declaration.watch ?? []) {
        if (kindOf(key) !== "component") throw new Error(`Finalizer "${declaration.name}" watches "${labelOf(key)}", which isn't a registered component.`);
        if (declarationOf(key)?.derived === true) throw new Error(`Finalizer "${declaration.name}" watches "${labelOf(key)}", which is derived; it sees only components user code adds and removes.`);
    }
    return addFinalizer(finalizer);
};
