import { definitionOf } from '../registry/program.js';
import { scheduleOf } from '../registry/schedule.js';
import { threadOf } from '../registry/threads.js';
import { checkWorldWritten } from '../registry/written.js';
import type { Schema } from '../schema/schema.js';
import type { Composite } from './composite.js';
import type { Definition } from './definition.js';
import type { Leaf } from './leaf.js';
import { labelOf } from '../registry/names.js';

type Key = symbol;

/** Throws if a key is in both `read` and `write`: `write` already makes it readable. */
const checkLists = (name: string, what: string, lists: { readonly read?: readonly Key[]; readonly write?: readonly Key[] } | undefined): void => {
    const writes = new Set(lists?.write);
    const both = (lists?.read ?? []).find(key => writes.has(key));
    if (both !== undefined) throw new Error(`System "${name}" lists "${labelOf(both)}" in both ${what} read and write; write already makes it readable.`);
};

/**
 * Throws for a leaf that lists a key in both `read` and `write`, has a lookup reading a component it writes, takes input
 * that isn't an object schema, or uses object components and resources of different threads.
 */
export const checkLeaf = (leaf: Leaf): void => {
    const { declaration } = leaf;
    const { name, components, resources, lookup, input } = declaration;
    checkLists(name, "components", components);
    checkLists(name, "resources", resources);
    checkWorldWritten(`System "${name}"`, resources?.write);
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
    threadOf(declaration, "System");
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
