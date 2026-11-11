// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceLists, SystemLookupLists } from './access.js';

// Changes and removed systems are sync systems: they run inside sync points, before they apply.
// Bodies' parameters are checked where they're created, so a sync system holds any body.

/** A removed system: runs, inside a sync point, for each entity that stops matching its components. */
export type RemovedSystem = {
    readonly kind: "removed";
    readonly name: string;
    readonly declaration: Resolved;
    body: (...parameters: never[]) => void;
};

/** A changes system: runs, inside a sync point, with all its structural changes to the components it watches. */
export type ChangesSystem = {
    readonly kind: "changes";
    readonly name: string;
    readonly declaration: ResolvedChanges;
    body: (...parameters: never[]) => void;
};

export type SyncSystem = RemovedSystem | ChangesSystem;

type Key = symbol;

/** What every changes and removed system's declaration holds as the world takes it, with what the build inferred its body uses. */
type ResolvedShared = {
    readonly lookup?: { readonly [name: string]: SystemLookupLists };
    readonly resources?: Pick<ResourceLists, "read" | "write">;
    readonly before?: readonly { readonly name: string }[];
    readonly after?: readonly { readonly name: string }[];
};

/** A removed system's declaration as the world takes it: what its body reads of its row in `read`, the rest of `with` in `has`. */
export type Resolved = ResolvedShared & {
    readonly components: { readonly read?: readonly Key[]; readonly has?: readonly Key[]; readonly optional?: readonly Key[]; readonly not?: readonly Key[] };
};

/**
 * A changes system's declaration as the world takes it. It watches the components listed, or every one (`true`),
 * and those declaring a trait of `componentTraits`; the resources listed, and those declaring a trait of
 * `resourceTraits`.
 */
export type ResolvedChanges = ResolvedShared & {
    readonly watch: {
        readonly components: true | readonly Key[];
        readonly componentTraits: readonly Key[];
        readonly resources: readonly Key[];
        readonly resourceTraits: readonly Key[];
    };
};
