// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Store } from "../../store/index.js";

/**
 * Pluggable load-time version/migration policy, consulted on every
 * `db.fromData(snapshot)` when configured on `Database.create`.
 *
 * The document's version is a plain **number** stored in an application-named
 * resource (`resource`), so it always round-trips with the serialized document.
 *
 * On load the snapshot is reconstructed into a fresh **document store** carrying
 * the *document's own* schema — a faithful copy of the document as it was saved,
 * at whatever version it was written at. This has NO dependence on the live
 * database's schema. The library reads the document version out of that document
 * store and the current version off the live database, and hands both — with the
 * document store — to `handle`, a pure upgrade function that converts the document
 * to the current version and returns the store to commit, or `null` to reject:
 *
 *   - **accept** (same version): return the document store as-is.
 *   - **upgrade** (older): transform the document store — or build a new store —
 *     up to the current schema/version and return it. The upgrade owns the target
 *     schema; it declares any new components itself (it is app code).
 *   - **reject** (newer, or otherwise unloadable): return `null`. The live
 *     database is left completely untouched — no copy, no observer
 *     notifications — so a rejected load never disturbs a live/populated db.
 *
 * The commit adopts **no schema** from the returned store. The live database is
 * already initialized to the current-version schema, so only the DATA for
 * components it declares is copied in; any foreign component the migration left
 * behind is dropped (the returned store is conformed to the current schema before
 * the copy). For every current-schema component the returned store carries, its
 * **typed-buffer storage** must match the live db's — a mismatch would let the
 * cheap `copy:false` structural adoption mis-read the buffer, so it **throws**:
 *   - buffer type + per-element byte size (a number that changed U16→U32 / F64→F32,
 *     or any change of buffer kind);
 *   - for a **value type** (a fixed-layout `struct`), the full struct layout —
 *     field names, order, offsets and types — so a same-size field reorder /
 *     rename / retype is caught too.
 * Cosmetic schema differences (`default`, min/max, description) are deliberately
 * NOT checked — those are the migration's responsibility. Rejecting a *document*
 * is data (`null`); a broken *migration* is a thrown developer error.
 *
 * On a successful load the library stamps the committed document's version
 * resource to `currentVersion` automatically (it already knows how to read it),
 * so the handler need not; then the data copies in via the normal `fromData`
 * reconciliation.
 *
 * Versioning applies only to whole-document loads. A *scoped* `fromData`
 * (partial quadrant, e.g. a settings sync) bypasses the handler and loads
 * directly — a partial load does not carry the whole document's version.
 *
 * `handle` may be **async** (return a `Promise`): `db.fromData` is async and awaits
 * it, so a migration can `await import("./upgrader")` to pull in migration code
 * only when a document actually needs upgrading — a rare event — rather than
 * bundling it into the startup path.
 *
 * No migration algorithm is coupled into the database; `handle` is caller-supplied.
 */
export interface DatabaseVersioning {
    /** Name of the resource holding the document's numeric version. */
    readonly resource: string;
    readonly handle: (context: {
        readonly documentStore: Store<any, any, any>;
        readonly documentVersion: number;
        readonly currentVersion: number;
    }) => Store<any, any, any> | null | Promise<Store<any, any, any> | null>;
}
