import type { Commands } from './commands.js';
import type { Context, Row } from './body.js';
import type { Declaration } from './declaration.js';

export type Leaf<D extends Declaration = Declaration> = {
    readonly declaration: D;
    body(row: Row<D>, context: Context<D>, commands: Commands): void;
};
