import type { ChangeSet, Context, Row, Watched } from './body.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';

/** Runs, inside a sync point, for each entity that stops matching its components. */
export type Leaf<D extends Declaration = Declaration> = {
    readonly kind: "finalizer";
    readonly declaration: D;
    body(row: Row<D>, context: Context<D>): void;
};

/** Runs, inside a sync point, with all its structural changes to the components it watches. */
export type Changes<D extends ChangesDeclaration = ChangesDeclaration> = {
    readonly kind: "changes";
    readonly declaration: D;
    body(changes: ChangeSet<Watched<D>>, context: Context<D>): void;
};

export type Finalizer = Leaf | Changes;

export * as Finalizer from './index.js';
