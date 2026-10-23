// © 2026 Adobe. MIT License. See /LICENSE for details.
import { layoutOf } from '../registry/layout.js';
import { declarationOf, kindOf, labelOf } from '../registry/names.js';
import { definitionOf } from '../registry/program.js';
import { reducedBy, scheduleOf } from '../registry/schedule.js';
import { conditional } from '../registry/schemas.js';
import { requireRegistered, threadOf } from '../registry/threads.js';
import { checkWorldWritten } from '../registry/written.js';
import { checkLookup, indexDefinitionOf, lookupKeysOf, orderKeysOf } from '../registry/indexes.js';
import { labelOfItem } from '../registry/items.js';
import type { Schema } from '../schema/schema.js';
import type { Composite } from './composite.js';
import type { Definition } from './definition.js';
import type { InputSchema, Leaf } from './leaf.js';

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

/** Why kernels can't read a component's values, or null when they can: they read only structs, in linear memory. */
const unreadByKernels = (key: symbol): string | null => {
    const { kind } = layoutOf(declarationOf(key)?.type);
    return kind === "object" ? "which isn't stored in linear memory" : kind === "string" ? "a string, which kernels don't read yet" : null;
};

/**
 * Throws for what a leaf's kind and placement rule out: `up` without components or through a key that isn't a reference
 * component, `order` by anything but a sorted index, without components, with `up` or on the GPU, a kernel's lookup of
 * a value outside linear memory, a GPU kernel's change filters, lookups and reductions, and a render system's
 * reductions.
 */
const checkPlacement = (leaf: Leaf): void => {
    const { name } = leaf;
    const { kernel, components, lookup, up, resources, order } = leaf.declaration;
    const fail = (message: string): never => { throw new Error(`System "${name}" ${message}.`); };
    if (order !== undefined) {
        const index = indexDefinitionOf(order);
        if (index === undefined) fail("orders its rows by a value Index.create didn't return");
        else if (index.declaration.sorted !== true) fail(`orders its rows by index "${labelOfItem(index)}", which isn't sorted`);
        if (components === undefined) fail("orders its rows without components, so it runs once");
        if (up !== undefined) fail("uses both up and order, which both decide the order of its rows");
        if (kernel === "gpu") fail("can't run on the GPU: GPU kernels have no order yet");
        if (kernel !== undefined) {
            for (const key of orderKeysOf(leaf.declaration)) {
                const unread = unreadByKernels(key);
                if (unread !== null) throw new Error(`Kernel "${name}": its rows are ordered by an index keyed by "${labelOf(key)}", ${unread}.`);
            }
        }
    }
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
            const unread = unreadByKernels(key);
            if (unread !== null) throw new Error(`Kernel "${name}": a lookup reads "${labelOf(key)}", ${unread}.`);
        }
        for (const key of lookups.flatMap(lookupKeysOf)) {
            const unread = unreadByKernels(key);
            if (unread !== null) throw new Error(`Kernel "${name}": a lookup goes through an index keyed by "${labelOf(key)}", ${unread}.`);
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
 * Throws for what an observer system can't declare: it only reads, after a sync point, so it writes and reduces into
 * nothing, takes no input, isn't a kernel or a render system, has no `up`, and is ordered with nothing.
 */
const checkObserver = (leaf: Leaf): void => {
    const { name, declaration } = leaf;
    const { observer } = declaration;
    if (observer === undefined) return;
    const fail = (message: string): never => { throw new Error(`System "${name}" is an observer, so it ${message}.`); };
    if (observer !== true) throw new Error(`System "${name}": observer is true or left out.`);
    if (leaf.kind === "render") fail("records no GPU work");
    if (declaration.kernel !== undefined) fail("isn't a kernel");
    if ((declaration.components?.write?.length ?? 0) + (declaration.resources?.write?.length ?? 0) > 0) fail("writes nothing");
    if (reducedBy(leaf).length > 0) fail("reduces into nothing");
    if (leaf.input !== undefined) fail("takes no input");
    if (declaration.up !== undefined) fail("has no up");
    if ((declaration.before?.length ?? 0) + (declaration.after?.length ?? 0) + (declaration.during?.length ?? 0) > 0) fail("is ordered with nothing");
};

/**
 * Throws for a leaf that names a component or resource that isn't registered as one, lists a key in both `read` and
 * `write`, writes a reference, has a lookup reading a component it writes, uses object components and resources of different threads, declares what an observer system can't, or whose
 * reductions, conditions, `up` or placement can't hold.
 */
export const checkLeaf = (leaf: Leaf): void => {
    const { name, declaration } = leaf;
    const { components, resources, lookup } = declaration;
    checkLists(name, "components", components);
    checkLists(name, "resources", resources);
    checkWorldWritten(`System "${name}"`, resources?.write);
    const writes = new Set<Key>(components?.write);
    for (const lookupName in lookup) {
        checkLookup("System", name, lookupName, lookup[lookupName]);
        for (const key of lookup[lookupName].read ?? []) {
            if (writes.has(key)) throw new Error(`System "${name}": lookup "${lookupName}" reads "${labelOf(key)}", which the system writes.`);
        }
        for (const key of lookupKeysOf(lookup[lookupName])) {
            if (writes.has(key)) throw new Error(`System "${name}": lookup "${lookupName}" goes through an index keyed by "${labelOf(key)}", which the system writes.`);
        }
    }
    for (const key of orderKeysOf(declaration)) {
        if (writes.has(key)) throw new Error(`System "${name}": its rows are ordered by an index keyed by "${labelOf(key)}", which the system writes.`);
    }
    checkTarget(leaf);
    threadOf(declaration, "System", name);
    requireRegistered("System", name, "component", components?.has);
    requireRegistered("System", name, "component", components?.not);
    for (const lookupName in lookup) {
        const found = lookup[lookupName];
        requireRegistered("System", name, "component", "has" in found ? found.has : undefined);
        requireRegistered("System", name, "component", "not" in found ? found.not : undefined);
    }
    for (const key of components?.write ?? []) {
        if (declarationOf(key)?.reference !== undefined) throw new Error(`System "${name}" writes "${labelOf(key)}", a reference, which changes only through commands.`);
    }
    checkObserver(leaf);
    checkReductions(leaf);
    checkConditions(leaf);
    checkPlacement(leaf);
};

const isInputSchema = (value: unknown): value is InputSchema =>
    typeof value === "object" && value !== null && Reflect.get(value, "type") === "object"
    && typeof Reflect.get(value, "properties") === "object" && Reflect.get(value, "properties") !== null;

/**
 * The schema of a body's input, which the plugin passes from the type of its parameter after the `before` before it.
 * Throws for a body taking input without one, as one not built with the plugin does, and for a schema that isn't an
 * object of named fields.
 */
export const inputSchemaOf = (name: string, body: (...parameters: never[]) => void, before: number, input: unknown): InputSchema | undefined => {
    if (input === undefined) {
        if (body.length > before) throw new Error(`System "${name}" takes input, whose schema the plugin gives from the type of its body's parameter: write its body in place and build it with the kernel plugin.`);
        return undefined;
    }
    if (!isInputSchema(input)) throw new Error(`System "${name}": input is an object schema of named fields.`);
    return input;
};

/**
 * Throws if a system on one entity takes it from what isn't an entity field of its input, has no components, or is a
 * kernel, has `up` or `order`, or reduces.
 */
const checkTarget = (leaf: Leaf): void => {
    const { name, declaration, input } = leaf;
    const { target, components, kernel, up, order, reduce } = declaration;
    if (target === undefined) return;
    const fail = (message: string): never => { throw new Error(`System "${name}" runs on one entity, so it ${message}.`); };
    const field: Schema | undefined = input !== undefined && "properties" in input ? Reflect.get(input.properties, target) : undefined;
    if (field === undefined || !("format" in field) || field.format !== "entity") fail(`takes it from an input field "${target}" holding an entity`);
    if (components === undefined) fail("needs components");
    if (kernel !== undefined) fail("isn't a kernel");
    if (up !== undefined || order !== undefined) fail("has no up or order");
    if (reduce !== undefined) fail("reduces into nothing");
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
