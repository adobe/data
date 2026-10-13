import type { Commands } from '../system/commands.js';
import type { Changes, Context, Row, Watched } from './body.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';

/** Runs, inside a sync point, for each entity that stops matching its query. */
export type Leaf<D extends Declaration = Declaration> = {
    readonly declaration: D;
    finalize(row: Row<D>, context: Context<D>, commands: Commands): void;
};

/** Runs, inside a sync point, with all its structural changes to the watched components. */
export type Whole<D extends ChangesDeclaration = ChangesDeclaration> = {
    readonly declaration: D;
    changes(changes: Changes<Watched<D>>, context: Context<D>, commands: Commands): void;
};

export type Finalizer = Leaf | Whole;

export * as Finalizer from './index.js';
