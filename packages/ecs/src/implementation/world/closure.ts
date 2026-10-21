/**
 * Structural derivation: which components an archetype's entities have once rules and `within` are applied.
 * Datalog with stratified negation over the components each entity has. A rule adds the components it derives where
 * its query matches; a component declared within a host stays only while the host is present. Each stratum is a least
 * fixed point, evaluated after every stratum it depends on, so the result is a pure function of the archetype.
 */

import type { Strata } from '../../interface/registry/strata.js';

/**
 * The sorted components an entity with `components` has once derived: derived components only where a rule derives
 * them, and components within a host only where the host is.
 */
export const closedComponents = (components: readonly number[], derived: readonly boolean[], hosts: readonly number[], strata: Strata): number[] => {
    const present = new Set<number>();
    const given = new Set<number>();
    for (const id of components) {
        if ((hosts[id] ?? -1) >= 0) given.add(id);
        else if (derived[id] !== true) present.add(id);
    }
    for (const { rules, within } of strata) {
        for (let changed = true; changed;) {
            changed = false;
            for (const rule of rules) {
                if (!rule.has.every(id => present.has(id)) || rule.not.some(id => present.has(id))) continue;
                for (const id of rule.derives) {
                    if (present.has(id)) continue;
                    present.add(id);
                    changed = true;
                }
            }
            for (const { dependent, host } of within) {
                if (present.has(dependent) || !given.has(dependent) || !present.has(host)) continue;
                present.add(dependent);
                changed = true;
            }
        }
    }
    return [...present].sort((a, b) => a - b);
};
