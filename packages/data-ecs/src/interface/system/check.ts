import { layoutOf } from '../registry/layout.js';
import { declarationOf, kindOf, labelOf } from '../registry/names.js';
import { definitionOf } from '../registry/program.js';
import { reducedBy, scheduleOf } from '../registry/schedule.js';
import { conditional } from '../registry/schemas.js';
import { requireRegistered, threadOf } from '../registry/threads.js';
import { checkWorldWritten } from '../registry/written.js';
import type { Schema } from '../schema/schema.js';
import type { Composite } from './composite.js';
import type { Definition } from './definition.js';
import type { Leaf } from './leaf.js';

type Key = symbol;

/** Throws if a key is in both `read` and `write`: `write` already makes it readable. */
const checkLists = (name: string, what: string, lists: { readonly read?: readonly Key[]; readonly write?: readonly Key[] } | undefined): void => {
    const writes = new Set(lists?.write);
    const both = (lists?.read ?? []).find(key => writes.has(key));
    if (both !== undefined) throw new Error(`System "${name}" lists "${labelOf(both)}" in both ${what} read and write; write already makes it readable.`);
};

/**
 * Throws if a leaf reduces into a resource with an operator its `reduce` trait doesn't declare, or also reads, writes
 * or filters on it, or writes a resource that's reduced, which only its contributors' fold sets.
 */
const checkReductions = (leaf: Leaf): void => {
    const { name } = leaf;
    const { reduce, resources } = leaf.declaration;
    const others = new Set<Key>([...resources?.read ?? [], ...resources?.write ?? [], ...resources?.changed ?? []]);
    for (const key of reducedBy(leaf)) {
        const declared = declarationOf(key)?.reduce;
        const operator: unknown = Reflect.get(reduce ?? {}, key);
        if (declared === undefined) throw new Error(`System "${name}" reduces "${labelOf(key)}", which has no reduce trait.`);
        if (declared !== operator) throw new Error(`System "${name}" reduces "${labelOf(key)}" with "${labelOf(operator)}", but it's declared reduce: "${labelOf(declared)}".`);
        if (others.has(key)) throw new Error(`System "${name}" reduces "${labelOf(key)}", so it can't also read, write or filter on it.`);
    }
    for (const key of resources?.write ?? []) {
        if (declarationOf(key)?.reduce !== undefined) throw new Error(`System "${name}" writes "${labelOf(key)}", which is reduced; only its contributors' fold sets it.`);
    }
};

/**
 * Throws if a condition isn't a resource whose value can be `null` or `false`, is in both `is` and `not`, or is also
 * read or written: `is` already makes it readable.
 */
const checkConditions = (leaf: Leaf): void => {
    const { name } = leaf;
    const { resources } = leaf.declaration;
    const is = resources?.is ?? [];
    const not = resources?.not ?? [];
    const listed = new Set<Key>([...resources?.read ?? [], ...resources?.write ?? []]);
    for (const key of [...is, ...not]) {
        const declaration = declarationOf(key);
        if (kindOf(key) !== "resource" || declaration === undefined) throw new Error(`System "${name}" runs on the condition of "${labelOf(key)}", which isn't a registered resource.`);
        const { type } = declaration;
        if (type !== undefined && !conditional(type)) throw new Error(`System "${name}" runs on the condition of "${labelOf(key)}", which is never null or false.`);
    }
    for (const key of is) {
        if (not.includes(key)) throw new Error(`System "${name}" lists "${labelOf(key)}" in both resources is and not.`);
        if (listed.has(key)) throw new Error(`System "${name}" lists "${labelOf(key)}" in resources is and in read or write; is already makes it readable.`);
    }
};

/**
 * Throws for what a leaf's kind and placement rule out: `up` without components or through a key that isn't a
 * reference component, a kernel's lookup of a value outside linear memory, a GPU kernel's change filters, lookups and
 * reductions, and a render system's reductions.
 */
const checkPlacement = (leaf: Leaf): void => {
    const { name } = leaf;
    const { kernel, components, lookup, up, resources } = leaf.declaration;
    const fail = (message: string): never => { throw new Error(`System "${name}" ${message}.`); };
    if (up !== undefined) {
        if (components === undefined) fail("uses up, which orders rows, without components");
        if (kindOf(up.through) !== "component" || declarationOf(up.through)?.reference === undefined) {
            throw new Error(`System "${name}": up.through "${labelOf(up.through)}" isn't a reference component.`);
        }
    }
    const lookups = Object.values(lookup ?? {});
    if (kernel !== undefined) {
        // Workers read lookups from shared memory, so their values must be linear there too.
        for (const key of lookups.flatMap(found => found.read ?? [])) {
            if (layoutOf(declarationOf(key)?.type).kind === "object") throw new Error(`Kernel "${name}": a lookup reads "${labelOf(key)}", which isn't stored in linear memory.`);
        }
    }
    const reduces = reducedBy(leaf).length > 0;
    if (kernel === "gpu") {
        if ((components?.added?.length ?? 0) + (components?.changed?.length ?? 0) + (resources?.changed?.length ?? 0) > 0) fail("can't run on the GPU: GPU kernels don't support change filters yet");
        if (lookups.length > 0) fail("can't run on the GPU: GPU kernels don't support lookups yet");
        if (reduces) fail("can't run on the GPU: GPU kernels don't support reductions yet");
    }
    if (reduces && leaf.kind === "render") fail("can't reduce: a render system records GPU work rather than running rows");
    if ((leaf.declaration.shader !== undefined) !== (leaf.kind === "render")) fail("has a shader only when System.render makes it");
};

/**
 * Throws for a leaf that names a component or resource that isn't registered as one, lists a key in both `read` and
 * `write`, writes a reference, has a lookup reading a component it writes, takes input that isn't an object schema,
 * uses object components and resources of different threads, or whose reductions, conditions, `up` or placement
 * can't hold.
 */
export const checkLeaf = (leaf: Leaf): void => {
    const { name, declaration } = leaf;
    const { components, resources, lookup, input } = declaration;
    checkLists(name, "components", components);
    checkLists(name, "resources", resources);
    checkWorldWritten(`System "${name}"`, resources?.write);
    checkWorldWritten(`System "${name}"`, components?.write);
    const writes = new Set<Key>(components?.write);
    for (const lookupName in lookup) {
        for (const key of lookup[lookupName].read ?? []) {
            if (writes.has(key)) throw new Error(`System "${name}": lookup "${lookupName}" reads "${labelOf(key)}", which the system writes.`);
        }
    }
    if (input !== undefined) {
        const schema: Schema = input;
        if (!("type" in schema) || schema.type !== "object" || typeof schema.properties !== "object" || schema.properties === null) {
            throw new Error(`System "${name}": input is an object schema of named fields.`);
        }
    }
    threadOf(declaration, "System", name);
    requireRegistered("System", name, "component", components?.has);
    requireRegistered("System", name, "component", components?.not);
    for (const lookupName in lookup) {
        requireRegistered("System", name, "component", lookup[lookupName].has);
        requireRegistered("System", name, "component", lookup[lookupName].not);
    }
    for (const key of components?.write ?? []) {
        if (declarationOf(key)?.reference !== undefined) throw new Error(`System "${name}" writes "${labelOf(key)}", a reference, which changes only through commands.`);
    }
    checkReductions(leaf);
    checkConditions(leaf);
    checkPlacement(leaf);
};

/** Every leaf under a system, each once. Throws for a member no System constructor returned. */
const leavesOf = (system: Definition, leaves: Set<Leaf>): Set<Leaf> => {
    if (system.kind !== "composite") return leaves.add(system);
    for (const member of system.declaration.systems) {
        const definition = definitionOf(member);
        if (definition === undefined) throw new Error(`System "${system.name}": member "${member.name}" isn't a system a System constructor returned.`);
        leavesOf(definition, leaves);
    }
    return leaves;
};

/**
 * Throws for a member no System constructor returned, members ordered in a cycle, two that conflict with no order
 * between them, or an input field two members declare with different schemas.
 */
export const checkComposite = (composite: Composite): void => {
    leavesOf(composite, new Set());
    scheduleOf(composite);
};
