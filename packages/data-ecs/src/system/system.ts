import type { Composite } from './composite.js';
import type { Leaf } from './leaf.js';

export type System = Leaf | Composite;

export * as System from './index.js';
