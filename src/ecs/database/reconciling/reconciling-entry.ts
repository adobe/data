// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../../types/types.js";
import { Components } from "../../store/components.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { TransactionResult } from "../transactional-store/index.js";
import { Store } from "../../store/index.js";
import { Entity } from "../../entity.js";

export type ReconcilingEntry<
    C extends Components = Components,
    R extends ResourceComponents = ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>> = ArchetypeComponents<StringKeyof<C>>,
> = {
    readonly id: number;
    readonly name: string;
    readonly transaction: (store: Store<C, R, A>, args: unknown) => void | Entity;
    readonly args: unknown;
    readonly time: number;
    result?: TransactionResult<C>;
};

export const ReconcilingEntryOps = {

    compare<
        C extends Components,
        R extends ResourceComponents,
        A extends ArchetypeComponents<StringKeyof<C>>
    >(a: ReconcilingEntry<C, R, A>, b: ReconcilingEntry<C, R, A>): number {
        const absDiff = Math.abs(a.time) - Math.abs(b.time);
        if (absDiff !== 0) {
            return absDiff;
        }
        const idDiff = a.id - b.id;
        if (idDiff !== 0) {
            return idDiff;
        }
        if (a.name < b.name) {
            return -1;
        }
        if (a.name > b.name) {
            return 1;
        }
        return 0;
    },
    findInsertIndex<
        C extends Components,
        R extends ResourceComponents,
        A extends ArchetypeComponents<StringKeyof<C>>
    >(entries: ReconcilingEntry<C, R, A>[], entry: ReconcilingEntry<C, R, A>): number {
        let low = 0;
        let high = entries.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (ReconcilingEntryOps.compare(entry, entries[mid]) < 0) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        return low;
    },
};

