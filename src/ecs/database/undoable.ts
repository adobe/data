// © 2026 Adobe. MIT License. See /LICENSE for details.

export type Undoable = {
    /**
     * Whether this operation can be combined with the previous operation.
     * This is useful for operations that are equivalent, such as adding the same component to an entity multiple times.
     * The value is either a boolean or else a data value that if equals() with the previous operation's coalesce value will cause the operations to be combined.
     */
    coalesce: boolean | unknown;
}