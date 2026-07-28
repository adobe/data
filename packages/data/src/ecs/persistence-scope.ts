// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Selects which persistent quadrants a `toData` / `fromData` operates on. Both
 * quadrants are persistent; they differ only by sharing:
 *   - `shared`    → the shared + persistent quadrant ("document")
 *   - `nonShared` → the nonShared + persistent quadrant ("settings")
 *
 * Omit the scope entirely to operate on the **whole** persistent snapshot (both
 * quadrants) — the default, whole-database behavior. Passing a scope makes the
 * operation surgical: `toData` emits row data only for the in-scope quadrant(s)
 * (every archetype's structure is still emitted so archetype ids stay aligned),
 * and `fromData` restores only the in-scope quadrant(s), leaving every other
 * quadrant — persistent or not — untouched. This lets one service own
 * `settings` while another owns `document`, each persisting to its own backend.
 */
export interface PersistenceScope {
    readonly shared?: boolean;
    readonly nonShared?: boolean;
}

/** Options for serializing a store/database snapshot via `toData`. */
export interface ToDataOptions {
    /**
     * Detach the snapshot from the live store (clone column/entity buffers) so
     * it survives later mutation. Otherwise the snapshot references live buffers
     * and is only valid until the next mutation.
     */
    readonly copy?: boolean;
    /** Restrict the snapshot to specific persistent quadrants; omit for all. */
    readonly scope?: PersistenceScope;
}
