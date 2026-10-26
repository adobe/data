// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationOf, labelOf } from '../../interface/registry/index.js';
import { layoutOf, samePath, type Layout, type Path } from '../../interface/registry/layout.js';
import type { Leaf } from '../../interface/system/leaf.js';
import type { KernelDescription } from './kernel.js';
import type { Key } from './state.js';

/**
 * A key's layout, or null for one this copy of the package didn't register, as a library bundling its own copy
 * registers its keys: a world binding the kernel checks those.
 */
const layoutOfKey = (key: Key): Layout | null => {
    const declaration = declarationOf(key);
    return declaration === undefined ? null : layoutOf(declaration.type);
};

/** Whether `path` names a scalar leaf of `layout`; true for an unknown layout. */
const hasLeaf = (layout: Layout | null, path: Path): boolean => layout === null || (layout.kind === "linear" && layout.leaves.some(leaf => samePath(leaf.path, path)));

/** Whether `leaves` are every scalar leaf of `layout`, each once; true for an unknown layout. */
const exactly = (layout: Layout | null, leaves: readonly Path[]): boolean => {
    if (layout === null) return true;
    const own = layout.kind === "linear" ? layout.leaves : [];
    return own.length === leaves.length && own.every(leaf => leaves.some(path => samePath(path, leaf.path)));
};

/**
 * How a compiled kernel doesn't match its declaration and the registered schemas, or null when it does. They don't
 * depend on a world, so registering the kernel rejects it where it's declared: every column, whole-value write, lookup,
 * `up` read and reduction it uses is declared, and names scalar leaves of its component's schema, each spawn site names
 * each of its components once, from its keys, and a tuple or struct a command or spawn gives goes to a component
 * stored in linear memory. The first mismatch.
 */
export const kernelMismatch = (leaf: Leaf, description: KernelDescription): string | null => {
    const { lookup, components: query, resources, up } = leaf.declaration;
    const reduces = new Set<Key>(resources?.reduce);
    const queried = new Set<Key>([...query?.read ?? [], ...query?.write ?? []]);
    const written = new Set<Key>(query?.write);
    // A condition in `is` is readable too, and the compiler lists it with the reads.
    const readable = new Set<Key>([...resources?.read ?? [], ...resources?.is ?? []]);
    for (const key of description.resources) if (!readable.has(key)) return `reads resource "${labelOf(key)}", which isn't in resources.read.`;
    for (const key of description.shared ?? []) {
        if (!queried.has(key)) return `reads "${labelOf(key)}", which isn't in its components' read.`;
        if (declarationOf(key) !== undefined && declarationOf(key)?.shared !== true) return `reads "${labelOf(key)}" as shared, which it isn't; rebuild.`;
    }
    for (const column of description.columns) {
        if (column.kind === "entity") continue;
        if (!queried.has(column.component)) return `"${labelOf(column.component)}" isn't in its components' read or write.`;
        if (column.kind === "changed" || column.kind === "chunks" || column.kind === "blocks") {
            if (!written.has(column.component)) return `writes "${labelOf(column.component)}", which isn't in its components' write.`;
            continue;
        }
        if (column.kind === "present") continue;
        const layout = layoutOfKey(column.component);
        if (layout !== null && layout.kind !== "linear") return `"${labelOf(column.component)}" isn't stored in linear memory.`;
        if (!hasLeaf(layout, column.path)) return `"${labelOf(column.component)}" has no scalar at [${column.path.join(", ")}]; destructure tuples and structs or index their fields.`;
    }
    for (const shape of description.shapes) {
        if (!written.has(shape.component)) return `writes "${labelOf(shape.component)}", which isn't in its components' write.`;
        if (!exactly(layoutOfKey(shape.component), shape.leaves)) return `a whole-value write of "${labelOf(shape.component)}" doesn't match its schema.`;
    }
    for (const lookupName of description.lookups) if (lookup?.[lookupName] === undefined) return `unknown lookup "${lookupName}".`;
    if ((description.up === true) !== (up !== undefined)) return description.up === true ? "reads up, which its declaration doesn't declare." : "its declaration declares up, which it doesn't read.";
    const upReadable = new Set<Key>(up?.read);
    for (const column of description.upColumns ?? []) {
        if (column.kind !== "field" || !upReadable.has(column.component)) return `reads "${labelOf(column.kind === "field" ? column.component : column.kind)}" through up, which isn't in up.read.`;
        const layout = layoutOfKey(column.component);
        if (layout !== null && layout.kind !== "linear") return `up reads "${labelOf(column.component)}", which isn't stored in linear memory.`;
        if (!hasLeaf(layout, column.path)) return `"${labelOf(column.component)}" has no scalar at [${column.path.join(", ")}]; destructure tuples and structs or index their fields.`;
    }
    for (const reduced of description.reductions) {
        if (!reduces.has(reduced.resource)) return `reduces "${labelOf(reduced.resource)}", which isn't in its resources' reduce.`;
        if (declarationOf(reduced.resource)?.reduce !== reduced.operator) return `reduces "${labelOf(reduced.resource)}" with "${reduced.operator}", but it's declared reduce: "${labelOf(declarationOf(reduced.resource)?.reduce)}"; rebuild.`;
        if (!hasLeaf(layoutOfKey(reduced.resource), reduced.path)) return `contributes to "${labelOf(reduced.resource)}" at [${reduced.path.join(", ")}], which isn't a scalar of its value; destructure tuples and structs or build them.`;
    }
    for (const list of description.spawns) {
        for (let position = 0; position < list.length; position++) {
            const k = list[position] ?? -1;
            if (!Number.isInteger(k) || k < 0 || k >= description.keys.length) return `spawns a list naming component ${k} of its ${description.keys.length} keys.`;
            if (list.findIndex(other => description.keys[other] === description.keys[k]) < position) return `spawns a list naming "${labelOf(description.keys[k])}" twice.`;
        }
    }
    for (const k of description.structuredValues) {
        const key = description.keys[k];
        const layout = key === undefined ? null : layoutOfKey(key);
        if (layout !== null && layout.kind !== "linear") return `gives "${labelOf(key)}" a tuple or struct, which only a component stored in linear memory takes.`;
    }
    for (const shape of description.reducedShapes) {
        if (!reduces.has(shape.component) || !exactly(layoutOfKey(shape.component), shape.leaves)) {
            return `contributes a value to "${labelOf(shape.component)}" that doesn't match its schema.`;
        }
    }
    return null;
};

/** Throws with the first way a compiled kernel doesn't match its declaration and the registered schemas (`kernelMismatch`). */
export const checkKernel = (leaf: Leaf, description: KernelDescription): void => {
    const mismatch = kernelMismatch(leaf, description);
    if (mismatch !== null) throw new Error(`Kernel "${leaf.name}": ${mismatch}`);
};
