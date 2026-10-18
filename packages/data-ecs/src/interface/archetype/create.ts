import type { Component } from '../component/component.js';
import { indexArchetype } from '../registry/archetypes.js';

/**
 * Declares an archetype: returns `components`, typed as the tuple given, with a program-wide index the world finds
 * its storage by. Throws for a component listed twice.
 */
export const create = <const C extends readonly Component.Key[]>(components: C): C => {
    indexArchetype(components);
    return components;
};
