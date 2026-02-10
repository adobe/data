// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Undoable } from "../undoable.js";

export type TransactionOptions = {
    /**
     * If this is a transient operation then it should not be persisted.
     * When an async sequence of operations is executed, they are all transient except the last one.
     */
    readonly transient?: boolean;
    /**
     * This value must be set fo undoable operations.
     */
    undoable?: Undoable;
}
