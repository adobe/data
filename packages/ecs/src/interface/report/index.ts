// © 2026 Adobe. MIT License. See /LICENSE for details.
import { create as createArchetype } from '../archetype/create.js';
import { run } from './components.js';

export { errors, run } from './components.js';
export type { Failure, Warning } from './failure.js';

/** A report's archetype: the world gives every run and tick one, which gains `errors` when something went wrong. */
export const Archetype = createArchetype([run]);
