import type { Path } from '../world/create/kernel.js';
import { declarator } from './booleans.js';
import { fresh, type Unit } from './unit.js';

/**
 * A local bound to a component value of unknown shape. Each leaf the body uses becomes its own local,
 * declared where the snapshot was bound, so later writes to the component don't change it.
 */
export type Snapshot = {
    readonly keyword: "const" | "let";
    readonly hint: string;
    readonly read: (path: Path) => string;
    readonly leaves: Map<string, { readonly name: string; readonly render: () => string }>;
};

export const createSnapshot = (keyword: "const" | "let", hint: string, read: (path: Path) => string): Snapshot =>
    ({ keyword, hint, read, leaves: new Map() });

/** The local holding one leaf of `snapshot`. */
export const snapshotLeaf = (unit: Unit, snapshot: Snapshot, path: Path): string => {
    const identity = JSON.stringify(path);
    const existing = snapshot.leaves.get(identity);
    if (existing !== undefined) return existing.name;
    const name = fresh(unit, snapshot.hint);
    snapshot.leaves.set(identity, { name, render: declarator(unit, name, snapshot.read(path)) });
    return name;
};

/** The declaration of every leaf used, rendered after the body is compiled. */
export const snapshotDeclaration = (unit: Unit, snapshot: Snapshot) => (): string =>
    snapshot.leaves.size === 0 ? "" : `${snapshot.keyword} ${[...snapshot.leaves.values()].map(leaf => leaf.render()).join(", ")};`;
