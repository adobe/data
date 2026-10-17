import type { Composite } from './composite.js';
import type { Leaf } from './leaf.js';

/** What the implementation knows of a system: the value a constructor returned, with its kind, declaration and body. */
export type Definition = Leaf | Composite;
