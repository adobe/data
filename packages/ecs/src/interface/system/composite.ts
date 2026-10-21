import type { CompositeDeclaration } from './composite-declaration.js';
import type { Name } from './name.js';

/** A system made of subsystems; members are flattened and ordered by their constraints. */
export type Composite = { readonly kind: "composite"; readonly name: Name; readonly declaration: CompositeDeclaration };
