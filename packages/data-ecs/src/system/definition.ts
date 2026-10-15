import type { Composite } from './composite.js';
import type { Leaf } from './leaf.js';
import type { Name } from './name.js';
import type { System } from './system.js';

/** What the implementation knows of a system: its kind, declaration and body. */
export type Definition = Leaf | Composite;

const definitions = new WeakMap<object, Definition>();
const systems = new WeakMap<Definition, System<Name, unknown>>();

/** The system a constructor returns for a definition: its name, frozen. `I` is the input its declaration takes. */
export const define = <N extends Name, I>(name: N, definition: Definition): System<N, I> => {
    const system = Object.freeze({ name });
    definitions.set(system, definition);
    systems.set(definition, system);
    return system;
};

/** A system's definition, or undefined for a value no constructor returned. */
export const definitionOf = (system: System<Name, unknown>): Definition | undefined => definitions.get(system);

/** The system a constructor returned for a definition. */
export const systemOf = (definition: Definition): System<Name, unknown> | undefined => systems.get(definition);
