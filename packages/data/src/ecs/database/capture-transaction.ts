// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Store } from "../store/index.js";
import { Components } from "../store/components.js";
import { ResourceComponents } from "../store/resource-components.js";
import { ArchetypeComponents } from "../store/archetype-components.js";
import { StringKeyof } from "../../types/types.js";
import { TransactionResult } from "./transactional-store/transactional-store.js";
import { createTransactionalStore } from "./transactional-store/create-transactional-store.js";

/**
 * Run `fn` against `store` as a single recorded transaction: `store` is mutated
 * in place, and the resulting change-set is returned as a {@link TransactionResult}.
 *
 * The returned result is a **replicable delta**: its `redo` operations can be
 * forwarded to a peer and replayed there with {@link applyOperations}, so a
 * pluggable replication strategy can propagate an *out-of-transaction* store edit
 * — e.g. a version-upgrade migration run inside a load handler — through whatever
 * transport it chooses. Core stays propagation-agnostic; this only captures.
 *
 * The transactional wrapper is created and discarded internally, so this is the
 * "wrap the store, do the work as one transaction, keep the change, throw the
 * wrapper away" pattern in a single call. Ops inside `fn` must go through the
 * provided `t` (not the outer `store`) to be recorded.
 */
export const captureTransaction = <
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
>(
    store: Store<C, R, A>,
    fn: (t: Store<C, R, A>) => void,
): TransactionResult<C> => createTransactionalStore(store).execute(fn);
