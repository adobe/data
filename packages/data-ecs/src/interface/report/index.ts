import { create as createArchetype } from '../archetype/create.js';
import { create as createIndex } from '../indexes/create.js';
import { dropped, failures, run, skipped, warnings } from './components.js';

export { dropped, failures, run, skipped, warnings } from './components.js';
export type { Failure, Warning } from './failure.js';

/** A report's components: the world spawns one for each run or tick that isn't clean. */
export const Archetype = createArchetype([run, failures, skipped, dropped, warnings]);

/**
 * Reports by their run's number, oldest first, holding every report component, so a lookup reads any of them: a run's
 * report, or null for a clean run, is `lookup(number)`.
 */
export const byRun = createIndex({ name: "Report/byRun", key: [run], components: { has: [failures, skipped, dropped, warnings] }, sorted: true, unique: true });
