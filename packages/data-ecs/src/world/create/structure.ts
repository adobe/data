import type { Archetype } from './archetype.js';
import type { Holders } from './holders.js';
import { closedComponents, strataOf, type RuleFacts, type Strata } from './closure.js';

/**
 * A world's structural derivation: its rules and `within` declarations as strata, the closure each archetype maps to,
 * and its references, with the holders of each target. Empty until rules, `within` or references are used, and every
 * sync-point step it adds is gated on that.
 */
export type Structure = {
    rules: readonly RuleFacts[];
    strata: Strata;
    /** By component id: the host of a component declared within one, or -1. */
    readonly hosts: number[];
    /** By host id: the components declared within it. */
    readonly dependents: number[][];
    /** By component id: 0, or the kind of reference it holds (`owner`, then `weak`). */
    readonly references: number[];
    /** Components holding references. */
    readonly referenceIds: number[];
    /** By reference component id: the holders of each target. */
    readonly holders: (Holders | undefined)[];
    /** By archetype id: the archetype id of its closure, or -1 until computed. */
    closures: number[];
    /** By `from + 1` and `to` archetype ids: the derived components an entity gains moving between them. */
    readonly gains: Map<number, readonly number[]>;
    /** Whether the next sync point re-derives every entity, after rules were registered. */
    rederive: boolean;
};

export const owner = 1;
export const weak = 2;

export const createStructure = (): Structure => ({
    rules: [], strata: [], hosts: [], dependents: [], references: [], referenceIds: [], holders: [], closures: [], gains: new Map(), rederive: false,
});

/** Whether the closure can differ from the archetype: some rule or `within` declaration exists. */
export const derives = (structure: Structure): boolean => structure.strata.length > 0;

/** Recomputes the strata, throwing for a cycle; on success the cached closures are dropped. */
export const restratify = (structure: Structure, rules: readonly RuleFacts[], hosts: readonly number[], nameOf: (id: number) => string): void => {
    const strata = strataOf(rules, hosts, nameOf);
    structure.rules = rules;
    structure.strata = strata;
    structure.closures = [];
    structure.gains.clear();
};

/** The archetype an entity with `archetype`'s components ends up in once derived. Computed once per archetype, at sync points. */
export const closureOf = (structure: Structure, derived: readonly boolean[], archetype: Archetype, archetypeOf: (components: readonly number[]) => Archetype, archetypes: readonly Archetype[]): Archetype => {
    if (archetype.resource || structure.strata.length === 0) return archetype;
    const cached = structure.closures[archetype.id] ?? -1;
    if (cached >= 0) return archetypes[cached];
    const closed = archetypeOf(closedComponents(archetype.components, derived, structure.hosts, structure.strata));
    structure.closures[archetype.id] = closed.id;
    return closed;
};

/** The derived components an entity gains moving from `from` (null when spawned) to `to`. */
export const gainsOf = (structure: Structure, derived: readonly boolean[], from: Archetype | null, to: Archetype): readonly number[] => {
    const key = ((from?.id ?? -1) + 1) * 0x200000 + to.id;
    let gains = structure.gains.get(key);
    if (gains === undefined) {
        gains = to.components.filter(id => derived[id] === true && from?.storageById[id] === undefined);
        structure.gains.set(key, gains);
    }
    return gains;
};
