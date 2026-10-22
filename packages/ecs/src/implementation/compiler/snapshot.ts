// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Path } from '../world/kernel.js';
import { record } from './booleans.js';
import type { Expression, Statement } from './ir.js';
import { fresh, type Unit } from './unit.js';

/**
 * A local bound to a component value of unknown shape. Each leaf the body uses becomes its own local,
 * set where the snapshot was bound, so later writes to the component don't change it.
 */
export type Snapshot = {
    readonly keyword: "const" | "let";
    readonly hint: string;
    readonly read: (path: Path) => Expression;
    readonly leaves: Map<string, { readonly local: number; readonly value: Expression }>;
};

export const createSnapshot = (keyword: "const" | "let", hint: string, read: (path: Path) => Expression): Snapshot =>
    ({ keyword, hint, read, leaves: new Map() });

/** The local holding one leaf of `snapshot`. */
export const snapshotLeaf = (unit: Unit, snapshot: Snapshot, path: Path): number => {
    const identity = JSON.stringify(path);
    const existing = snapshot.leaves.get(identity);
    if (existing !== undefined) return existing.local;
    const local = fresh(unit, snapshot.hint);
    const value = snapshot.read(path);
    record(unit, local, value);
    snapshot.leaves.set(identity, { local, value });
    return local;
};

/** The leaves the body used, resolved after the body is compiled. */
export const snapshotDeclaration = (snapshot: Snapshot) => (): readonly Statement[] =>
    [...snapshot.leaves.values()].map(leaf => ({ kind: "set", local: leaf.local, value: leaf.value, declare: snapshot.keyword }));
