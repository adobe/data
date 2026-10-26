// © 2026 Adobe. MIT License. See /LICENSE for details.
import { nameOf } from '../registry/items.js';
import { claimSystem } from '../registry/program.js';
import { checkLeaf, inputSchemaOf } from './check.js';
import type { Resolved } from './declaration.js';
import type { Leaf } from './leaf.js';
import type { System } from './system.js';

/**
 * Makes a system of a declaration as the world takes it, with what its body reads and writes already listed: for the
 * implementation's own systems, such as those standing for a joined thread's, whose bodies no build reads. Checks it
 * as `System.create` does. Not part of the package's interface.
 */
export const createResolved = (declaration: Resolved, body: Leaf["body"], input?: unknown): System<unknown> => {
    const name = nameOf(declaration, undefined, "system");
    const schema = inputSchemaOf(name, body, declaration.components === undefined ? 1 : 2, input);
    const system: Leaf & System<unknown> = { kind: "system", name, declaration, input: schema, body };
    checkLeaf(system);
    claimSystem(system, undefined);
    return system;
};
