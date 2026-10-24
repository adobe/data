// © 2026 Adobe. MIT License. See /LICENSE for details.
import { indexArchetype } from '../registry/archetypes.js';
import { run } from './components.js';

export { errors, run } from './components.js';
export type { Failure, Warning } from './failure.js';

/** A report's archetype: the world gives every run and tick one, which gains `errors` when something went wrong. */
export const Archetype = [run] as const;
// The package's own lists are built without the plugin, so they take their indexes here.
indexArchetype(Archetype);
