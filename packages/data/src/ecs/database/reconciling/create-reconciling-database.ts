// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../../types/types.js";
import type { TransactionDeclarations } from "../../store/transaction-functions.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { Store } from "../../store/index.js";
import { Components } from "../../store/components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { ReconcilingDatabase } from "./reconciling-database.js";
import { createObservedDatabase } from "../observed/create-observed-database.js";
import { createRebaseReplayApplier } from "./create-rebase-replay-applier.js";
import { Entity } from "../../entity/entity.js";
import { Database } from "../database.js";

/**
 * Creates a database that wraps `store` with the rebase-replay reconciliation
 * protocol on top of an observed database.
 *
 * Prefer {@link createRebaseReplayConcurrency} when building a new database
 * via {@link createDatabase} — it plugs into the concurrency-strategy seam
 * and composes cleanly with the rest of the database construction path.
 *
 * This function is kept for direct use (e.g. tests, lower-level tooling)
 * where the full `Database` surface is not needed.
 */
export function createReconcilingDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends TransactionDeclarations<C, R, A>
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
): ReconcilingDatabase<C, R, A, TD> {
    type TransactionName = Extract<keyof TD, string>;

    const transactionDeclarationsRef: TransactionDeclarations<C, R, A> = {
        ...transactionDeclarations,
    };

    const observedDatabase = createObservedDatabase(store);

    const getTransaction = (name: string) =>
        (transactionDeclarationsRef as Record<string, ((ctx: any, args: unknown) => void | Entity) | undefined>)[name];

    const applier = createRebaseReplayApplier(observedDatabase.execute, getTransaction);

    const reconcilingDatabase: ReconcilingDatabase<C, R, A, TD> = {
        ...observedDatabase,
        reset: () => {
            applier.onReset();
            observedDatabase.reset();
        },
        toData: () => applier.toData(() => observedDatabase.toData()),
        fromData: (data: unknown) => applier.fromData((d) => observedDatabase.fromData(d), data),
        apply: applier.apply as ReconcilingDatabase<C, R, A, TD>["apply"],
        cancel: applier.cancel,
        extend: (plugin: any) => {
            observedDatabase.extend(plugin);
            if (plugin.transactions) {
                Object.assign(transactionDeclarationsRef, plugin.transactions);
            }
            return reconcilingDatabase as any;
        },
    };

    return reconcilingDatabase;
}
