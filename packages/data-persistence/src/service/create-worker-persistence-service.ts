// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Archetype } from "@adobe/data/ecs";
import { createColumnEncoder } from "../encoder/create-column-encoder.js";
import type { ArchetypeManifest, ColumnEncoder, ColumnManifest, Manifest } from "../encoder/types.js";
import { decodeJournalStream, encodeJournalEntry } from "../journal/journal-codec.js";
import type { JournalEntry, JournalEntryKind } from "../journal/journal-entry.js";
import { createInprocessTransport } from "../transport/inprocess-transport.js";
import type { ListDirResult, PersistOp, ReadFileResult, Transport } from "../transport/transport.js";
import { createEntityLocationCache } from "./entity-location-cache.js";
import { asMutableArchetype, getColumn, getIdColumn, getMutableStore } from "./internal-access.js";
import type { WorkerPersistenceService, WorkerPersistenceServiceOptions } from "./worker-persistence-service.js";

const META_FILE = "meta.json";
const ENTITY_LOCATION_FILE = "entity-location.bin";
const JOURNAL_FILE = "journal.bin";
const ELT_STRIDE = 8;
const columnPath = (archetypeId: number, component: string): string =>
    `archetypes/${archetypeId}/${component}.bin`;

interface ArchetypeContext {
    readonly id: number;
    readonly name: string;
    readonly archetype: Archetype<any>;
    /** Encoders by component name. */
    readonly encoders: Map<string, ColumnEncoder>;
    /** Component intern table for journal entries. */
    readonly componentIds: Map<string, number>;
}

const DEFAULT_CHECKPOINT_TXS = 1000;
const DEFAULT_CHECKPOINT_IDLE_MS = 5000;

/**
 * Create a {@link WorkerPersistenceService}. The service subscribes to
 * the database's transaction observer and writes changes incrementally
 * via the configured backend / transport.
 */
export const createWorkerPersistenceService = async (
    options: WorkerPersistenceServiceOptions,
): Promise<WorkerPersistenceService> => {
    const {
        database,
        backend,
        transport: providedTransport,
        autoPersist = true,
        checkpoint: checkpointConfig,
        clock = () => Date.now(),
        txIdGenerator,
    } = options;

    const transport: Transport = providedTransport ?? createInprocessTransport(backend);
    const ownsTransport = providedTransport === undefined;

    const everyNTransactions = checkpointConfig?.everyNTransactions ?? DEFAULT_CHECKPOINT_TXS;
    const idleMs = checkpointConfig?.idleMs ?? DEFAULT_CHECKPOINT_IDLE_MS;

    let nextOpId = 1;
    const allocOpId = (): number => {
        const id = nextOpId;
        nextOpId += 1;
        return id;
    };

    let nextTxId = 1;
    const allocTxId = (): number =>
        txIdGenerator ? txIdGenerator() : (() => { const id = nextTxId; nextTxId += 1; return id; })();

    // Cache per-archetype context. We discover archetypes lazily as
    // they appear in changedEntities so that newly-introduced
    // archetypes (created by an extend after service init) are picked
    // up automatically.
    const archetypeContexts = new Map<number, ArchetypeContext>();
    let nextComponentId = 1;
    const globalComponentIds = new Map<string, number>();
    const internComponent = (name: string): number => {
        const existing = globalComponentIds.get(name);
        if (existing !== undefined) return existing;
        const id = nextComponentId;
        nextComponentId += 1;
        globalComponentIds.set(name, id);
        return id;
    };

    const store = getMutableStore(database);

    const getArchetypeContext = (archetype: Archetype<any>): ArchetypeContext => {
        const existing = archetypeContexts.get(archetype.id);
        if (existing !== undefined) return existing;

        // Find the archetype's name via reverse lookup. The store does
        // not expose names directly, so fall back to a stringified id
        // when not found among named archetypes.
        let archetypeName = `archetype-${archetype.id}`;
        const named = store.archetypes;
        for (const key in named) {
            if (named[key] === archetype) {
                archetypeName = key;
                break;
            }
        }

        const encoders = new Map<string, ColumnEncoder>();
        for (const component of archetype.components) {
            // Skip the implicit `id` column — entity ids are recovered
            // from entity-location.bin (which is keyed by entity id), so
            // storing them again per archetype row would be redundant.
            if (component === "id") continue;
            const buffer = getColumn(archetype, component);
            if (buffer === undefined) continue;
            encoders.set(component, createColumnEncoder(component, buffer));
            internComponent(component);
        }

        const componentIds = new Map<string, number>();
        for (const component of archetype.components) {
            if (component === "id") continue;
            componentIds.set(component, internComponent(component));
        }

        const ctx: ArchetypeContext = {
            id: archetype.id,
            name: archetypeName,
            archetype,
            encoders,
            componentIds,
        };
        archetypeContexts.set(archetype.id, ctx);
        return ctx;
    };

    const sendJournal = (entry: JournalEntry): void => {
        // encodeJournalEntry already produces a freshly-allocated,
        // owned, transferable ArrayBuffer. Forward it directly — the
        // transport's send() lists it in postMessage's transfer set
        // for zero-copy worker handoff.
        const op: PersistOp = {
            id: allocOpId(),
            kind: "appendJournal",
            bytes: encodeJournalEntry(entry),
        };
        transport.send(op);
    };

    const sendColumnSlice = (
        archetypeId: number,
        component: string,
        rowIndex: number,
        encoder: ColumnEncoder,
    ): void => {
        if (encoder.storage !== "fixed") return;
        const bytes = encoder.encodeRows(rowIndex, 1);
        if (bytes === null) return;
        const op: PersistOp = {
            id: allocOpId(),
            kind: "writeColumnSlice",
            archetypeId,
            component,
            rowOffset: rowIndex * encoder.stride,
            bytes,
        };
        transport.send(op);
    };

    const sendEntityLocation = (entity: number, archetypeId: number, rowIndex: number): void => {
        transport.send({ id: allocOpId(), kind: "writeEntityLocation", entity, archetypeId, rowIndex });
    };

    const sendEntityDelete = (entity: number): void => {
        transport.send({ id: allocOpId(), kind: "deleteEntityLocation", entity });
    };

    let txsSinceCheckpoint = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleIdleCheckpoint = (): void => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        if (idleMs <= 0) return;
        idleTimer = setTimeout(() => {
            void doCheckpoint();
        }, idleMs);
    };

    const buildManifest = (): Manifest => {
        const archetypes: Record<number, ArchetypeManifest> = {};
        const named = store.archetypes;
        for (const key in named) {
            const archetype = named[key]!;
            const ctx = getArchetypeContext(archetype);
            const columns: Record<string, ColumnManifest> = {};
            for (const component of archetype.components) {
                const encoder = ctx.encoders.get(component);
                if (encoder === undefined) continue;
                const buffer = getColumn(archetype, component);
                if (buffer === undefined) continue;
                columns[component] = {
                    component,
                    stride: encoder.stride,
                    storage: encoder.storage,
                    bufferType: buffer.type,
                };
            }
            archetypes[archetype.id] = {
                id: archetype.id,
                name: ctx.name,
                rowCount: archetype.rowCount,
                rowCapacity: archetype.rowCapacity,
                columns,
            };
        }
        // Persist the component intern table so the loader can map
        // journal componentId codes back to live column names during
        // replay. Built from the global table (which spans every
        // archetype the service has touched).
        const components: Record<number, string> = {};
        for (const [name, id] of globalComponentIds) {
            components[id] = name;
        }
        return {
            version: 1,
            checkpointId: clock(),
            archetypes,
            entityLocation: { stride: 8 },
            components,
        };
    };

    let checkpointInFlight: Promise<void> | null = null;
    const doCheckpoint = async (): Promise<void> => {
        if (checkpointInFlight !== null) return checkpointInFlight;
        if (idleTimer !== null) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        // Drain all pending column / journal / entity-location writes
        // before snapshotting the manifest and truncating the journal —
        // otherwise a write enqueued just before the checkpoint could
        // land in the truncated tail.
        await transport.flush();
        const manifest = buildManifest();
        const op: PersistOp = { id: allocOpId(), kind: "checkpoint", manifest };
        checkpointInFlight = transport.request<void>(op).finally(() => {
            checkpointInFlight = null;
            txsSinceCheckpoint = 0;
        });
        await checkpointInFlight;
    };

    // Track every persisted entity's last known on-disk location.
    // Required to detect swap-remove side effects: when an entity at
    // row X is deleted (or moves to a different archetype), the table
    // moves the last row into row X. The transaction observer does NOT
    // report that incidental move, so we have to detect it ourselves
    // by re-reading the id column at the vacated slot and treating any
    // entity now living there as a synthetic change.
    //
    // Backed by a flat Uint32Array indexed by entity id (two slots
    // per entity) — avoids the per-change Map lookup + per-entry
    // object allocation a `Map<number, {a, r}>` would require.
    const entityLocations = createEntityLocationCache();

    const detectSwapRemoveAt = (
        archetypeId: number,
        row: number,
        txId: number,
        alreadyHandled: Set<number>,
    ): void => {
        // archetypeContexts is keyed by archetype id; if we recorded an
        // entity at (archetypeId, row) at any point, the context for
        // archetypeId is guaranteed to be in the cache by the time we
        // try to detect a swap-remove there. Direct map lookup is
        // O(1); the previous linear scan over `store.archetypes` was
        // O(archetypes) per delete and showed up under workloads that
        // delete many entities.
        const ctx = archetypeContexts.get(archetypeId);
        if (ctx === undefined) return;
        const archetype = ctx.archetype;
        if (row >= archetype.rowCount) return; // nothing was moved into this slot
        const idColumn = getIdColumn(archetype);
        if (idColumn === undefined) return;
        const movedEntity = idColumn.get(row);
        if (alreadyHandled.has(movedEntity)) return;
        alreadyHandled.add(movedEntity);
        // The swap-moved entity now lives at a fresh row whose
        // contents are wholesale new — every column needs writing,
        // not just the columns the user transaction touched.
        handleEntityUpdate(movedEntity, null, txId, alreadyHandled);
    };

    const handleEntityDelete = (
        entity: number,
        txId: number,
        alreadyHandled: Set<number>,
    ): void => {
        const prevArchetype = entityLocations.getArchetypeId(entity);
        const prevRow = prevArchetype >= 0 ? entityLocations.getRow(entity) : -1;
        // WAL discipline: append the journal entry FIRST, then update
        // the on-disk snapshot (entity-location.bin). On crash, replay
        // applies the journal — which means the snapshot is always
        // catching up to the WAL, never running ahead of it.
        sendJournal({
            txId,
            timestampMs: clock(),
            kind: "delete",
            entity,
            archetypeId: 0,
            rowIndex: 0,
            componentId: 0,
            bytes: new Uint8Array(0),
        });
        sendEntityDelete(entity);
        entityLocations.delete(entity);
        // The deleted entity may have been swap-removed: another
        // entity may now occupy its old row.
        if (prevArchetype >= 0) {
            detectSwapRemoveAt(prevArchetype, prevRow, txId, alreadyHandled);
        }
    };

    /**
     * Persist a present entity. `changedComponents`:
     *   - `Set<string>`  → write only the named columns. Used for
     *                      pure same-row updates where the user
     *                      transaction touched a known subset.
     *   - `null`         → write all columns. Used for new entities,
     *                      archetype migrations, and the synthetic
     *                      swap-remove path, where the destination
     *                      row's bytes are wholesale new.
     *
     * Send order within a tx: every journal entry for this entity is
     * appended FIRST (one per emitColumn call), then the
     * entity-location update is sent. The journal is the WAL; the
     * snapshot files (column slices + ELT) lag behind.
     */
    const handleEntityUpdate = (
        entity: number,
        changedComponents: ReadonlySet<string> | null,
        txId: number,
        alreadyHandled: Set<number>,
    ): void => {
        const prevArchetype = entityLocations.getArchetypeId(entity);
        const prevRow = prevArchetype >= 0 ? entityLocations.getRow(entity) : -1;
        const located = store.locate(entity);
        if (located === null) {
            // Edge case: the user transaction reported the entity as
            // present but the store no longer has it. Fall back to
            // delete (which already follows WAL ordering internally).
            handleEntityDelete(entity, txId, alreadyHandled);
            return;
        }

        const ctx = getArchetypeContext(located.archetype);

        // Decide whether we can trust changedComponents: only when the
        // entity stayed at the SAME (archetype, row). Anything else
        // means the destination row's underlying memory is freshly
        // populated (insert / migrate / swap-into-this-row) and every
        // column must be flushed even if the user touched just one.
        const sameLocation =
            prevArchetype === ctx.id && prevRow === located.row;
        const writeAll = changedComponents === null || !sameLocation;

        if (writeAll) {
            for (const [component, encoder] of ctx.encoders) {
                emitColumn(entity, ctx, component, encoder, located.row, txId);
            }
        } else {
            for (const component of changedComponents) {
                const encoder = ctx.encoders.get(component);
                if (encoder === undefined) continue;
                emitColumn(entity, ctx, component, encoder, located.row, txId);
            }
        }
        // Snapshot writes go AFTER journal entries for this entity.
        sendEntityLocation(entity, ctx.id, located.row);

        const moved = prevArchetype >= 0 && !sameLocation;
        entityLocations.set(entity, ctx.id, located.row);
        if (moved) {
            detectSwapRemoveAt(prevArchetype, prevRow, txId, alreadyHandled);
        }
    };

    const emitColumn = (
        entity: number,
        ctx: ArchetypeContext,
        component: string,
        encoder: ColumnEncoder,
        row: number,
        txId: number,
    ): void => {
        // WAL discipline: append the journal entry FIRST, then write
        // the column slice. The column file is the snapshot; the
        // journal is the source of truth.
        const payload = encoder.encodeRowValue(row);
        const journalKind: JournalEntryKind = "update";
        sendJournal({
            txId,
            timestampMs: clock(),
            kind: journalKind,
            entity,
            archetypeId: ctx.id,
            rowIndex: row,
            componentId: ctx.componentIds.get(component) ?? 0,
            bytes: payload ?? new Uint8Array(0),
        });
        sendColumnSlice(ctx.id, component, row, encoder);
    };

    const sendCommit = (txId: number): void => {
        // Tx-end marker: replay buffers entries by txId and only
        // applies a tx once it sees this entry. A torn tail loses the
        // commit, so the entire tx is dropped — atomicity preserved.
        sendJournal({
            txId,
            timestampMs: clock(),
            kind: "commit",
            entity: 0,
            archetypeId: 0,
            rowIndex: 0,
            componentId: 0,
            bytes: new Uint8Array(0),
        });
    };

    // Surface any error returned by the worker side via ack messages.
    // Without this, fire-and-forget sends fail silently — a class of
    // bug that is very hard to diagnose in production.
    const errorListeners = new Set<(err: Error) => void>();
    const offMessage = transport.onMessage((msg) => {
        if (msg.kind === "ack" && msg.error !== undefined) {
            const err = new Error(`Persistence op ${msg.id} failed: ${msg.error}`);
            for (const listener of errorListeners) listener(err);
            // Also surface to the host as an unhandled error so test
            // suites and process-level error handlers see it.
            queueMicrotask(() => { throw err; });
        }
    });

    let unsubscribe: (() => void) | null = null;
    if (autoPersist) {
        unsubscribe = database.observe.transactions((result) => {
            if (result.transient || result.ephemeral) return;
            // One txId per observer firing — every entity-level entry
            // we emit for this user transaction shares it, and the
            // trailing commit entry uses the same id. Replay groups by
            // txId so this is what makes torn-tail recovery atomic.
            const txId = allocTxId();
            const alreadyHandled = new Set<number>();
            for (const entity of result.changedEntities.keys()) alreadyHandled.add(entity);
            for (const [entity, values] of result.changedEntities) {
                if (values === null) {
                    handleEntityDelete(entity, txId, alreadyHandled);
                } else {
                    // The patched values map's keys are the union of
                    // every component the transaction touched for this
                    // entity. For pure same-row updates this is a strict
                    // subset of all columns — emitting only those is
                    // the per-component-write optimization.
                    const components = Object.keys(values) as readonly string[];
                    handleEntityUpdate(entity, new Set<string>(components), txId, alreadyHandled);
                }
            }
            sendCommit(txId);
            txsSinceCheckpoint += 1;
            if (everyNTransactions > 0 && txsSinceCheckpoint >= everyNTransactions) {
                void doCheckpoint();
            } else {
                scheduleIdleCheckpoint();
            }
        });
    }

    const save = async (): Promise<void> => {
        // Initial snapshot framed as one logical transaction so the
        // commit marker covers it. If a crash happens mid-save with
        // no prior checkpoint, replay either applies the entire
        // initial snapshot or none of it.
        const txId = allocTxId();
        const named = store.archetypes;
        const handled = new Set<number>();
        for (const key in named) {
            const archetype = named[key]!;
            const idColumn = getIdColumn(archetype);
            if (idColumn === undefined) continue;
            for (let row = 0; row < archetype.rowCount; row++) {
                const entity = idColumn.get(row);
                handled.add(entity);
                handleEntityUpdate(entity, null, txId, handled);
            }
        }
        sendCommit(txId);
        await doCheckpoint();
    };

    /**
     * Restore the database from the persisted snapshot, then apply any
     * journal entries appended after the last checkpoint. Steps:
     *
     *   1. Probe the root for `meta.json`; absent → no snapshot, return.
     *   2. Read and parse the manifest.
     *   3. For each archetype: look up the live archetype by name,
     *      grow column buffers to the persisted capacity, bulk-copy
     *      each column file's bytes into the typed array, and restore
     *      `rowCount`.
     *   4. Read `entity-location.bin` and build an in-memory snapshot
     *      of the entity-location table (entities Int32Array + free
     *      list).
     *   5. Replay the journal forward over the snapshot — this both
     *      repairs partial column writes from a crashed transaction
     *      and rolls forward any complete transactions that landed in
     *      the journal but whose checkpoint never ran.
     *   6. Reconstruct each archetype's implicit `id` column from the
     *      final ELT and hand the table back through `store.fromData`.
     *
     * After load(), the database is at the same state as the last
     * fully-recorded transaction in the journal — durable across
     * crashes that may have killed the process mid-checkpoint or
     * mid-transaction.
     */
    const load = async (): Promise<void> => {
        const manifest = await readManifestIfPresent();
        if (manifest === null) return;

        // Re-seed the global component intern table so newly-emitted
        // journal entries (from post-load transactions) reuse the
        // same numeric ids as the persisted ones. Without this we'd
        // double-allocate ids for components we already know about.
        rehydrateComponentIds(manifest);

        for (const aManId in manifest.archetypes) {
            const aMan = manifest.archetypes[aManId]!;
            await restoreArchetype(aMan);
        }

        const eltState = await readEntityLocationSnapshot();
        await replayJournal(manifest, eltState);
        finalizeEntityLocationTable(manifest, eltState);
    };

    const rehydrateComponentIds = (manifest: Manifest): void => {
        let maxId = 0;
        for (const idStr in manifest.components) {
            const id = Number(idStr);
            const name = manifest.components[id]!;
            globalComponentIds.set(name, id);
            if (id > maxId) maxId = id;
        }
        nextComponentId = maxId + 1;
    };

    const readManifestIfPresent = async (): Promise<Manifest | null> => {
        const list = await transport.request<ListDirResult>({
            id: allocOpId(),
            kind: "listDir",
            path: ".",
        });
        if (!list.entries.includes(META_FILE)) return null;
        const reply = await transport.request<ReadFileResult>({
            id: allocOpId(),
            kind: "readFile",
            path: META_FILE,
        });
        if (reply.bytes.byteLength === 0) return null;
        const text = new TextDecoder().decode(new Uint8Array(reply.bytes));
        return parseManifest(text);
    };

    /**
     * Parse and minimally validate a manifest. We only check the
     * top-level `version` and `archetypes` shape — once those are
     * present the structure was written by this same package and we
     * trust the rest. A future schema-evolution version bump would
     * dispatch on `version` here.
     *
     * Forward-compat: the `components` intern table was added after
     * v1's initial release. Older v1 manifests written by previous
     * builds may not have it; default to an empty table so journal
     * replay can still proceed (entries with componentId === 0 — the
     * pre-intern-table sentinel — are filtered out anyway).
     */
    const parseManifest = (text: string): Manifest => {
        const raw: unknown = JSON.parse(text);
        if (typeof raw !== "object" || raw === null) {
            throw new Error("WorkerPersistenceService.load: meta.json is not an object");
        }
        const obj = raw as { version?: unknown; archetypes?: unknown; components?: unknown };
        if (obj.version !== 1) {
            throw new Error(`WorkerPersistenceService.load: unsupported manifest version ${String(obj.version)}`);
        }
        if (typeof obj.archetypes !== "object" || obj.archetypes === null) {
            throw new Error("WorkerPersistenceService.load: meta.json missing archetypes table");
        }
        if (typeof obj.components !== "object" || obj.components === null) {
            // Patch in the empty table without mutating the parsed object's
            // existing structure — keeps the unknown-shape upcast honest.
            return { ...(raw as Manifest), components: {} };
        }
        return raw as Manifest;
    };

    const restoreArchetype = async (aMan: ArchetypeManifest): Promise<void> => {
        // The plugin must have re-declared the same archetype shape
        // before load() runs; we only look up, never create.
        const lookup = store.archetypes[aMan.name];
        if (lookup === undefined) {
            throw new Error(
                `WorkerPersistenceService.load: archetype "${aMan.name}" present in manifest but not in the live database. ` +
                "Re-extend the database with the same plugin before calling load().",
            );
        }
        const liveArchetype = asMutableArchetype(lookup);

        // Grow column capacity so bulk byte writes don't run past the
        // typed array's length. createTable starts at 16, so a small
        // archetype may not need this — but we always bump if needed.
        if (aMan.rowCapacity > liveArchetype.rowCapacity) {
            for (const component of liveArchetype.components) {
                const buffer = getColumn(liveArchetype, component);
                if (buffer === undefined) continue;
                buffer.capacity = aMan.rowCapacity;
            }
            liveArchetype.rowCapacity = aMan.rowCapacity;
        }

        for (const componentName in aMan.columns) {
            const colMan = aMan.columns[componentName]!;
            // The implicit `id` column is reconstructed from the entity
            // location table on a separate pass below.
            if (colMan.component === "id") continue;
            await restoreColumn(aMan, colMan, liveArchetype);
        }

        liveArchetype.rowCount = aMan.rowCount;
    };

    const restoreColumn = async (
        aMan: ArchetypeManifest,
        colMan: ColumnManifest,
        liveArchetype: Archetype<any>,
    ): Promise<void> => {
        // Only fixed-stride columns have on-disk byte ranges. Other
        // storage kinds replay from the journal, which is a no-op in
        // this release.
        if (colMan.storage !== "fixed") return;
        const buffer = getColumn(liveArchetype, colMan.component);
        if (buffer === undefined) return;
        const reply = await transport.request<ReadFileResult>({
            id: allocOpId(),
            kind: "readFile",
            path: columnPath(aMan.id, colMan.component),
        });
        if (reply.bytes.byteLength === 0) return;
        const ta = buffer.getTypedArray();
        const dest = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
        const src = new Uint8Array(reply.bytes);
        // Copy at most as many bytes as fit. The manifest's rowCount *
        // stride should equal src.byteLength under normal operation; a
        // shorter file is tolerated (treated as zero-fill).
        dest.set(src.subarray(0, Math.min(src.byteLength, dest.byteLength)), 0);
    };

    /**
     * Mutable in-memory snapshot of the entity-location table, used
     * during load() before journal replay.
     */
    interface EltState {
        entities: Int32Array;
        capacity: number;
        nextIndex: number;
        freeListHead: number;
    }

    const readEntityLocationSnapshot = async (): Promise<EltState> => {
        const reply = await transport.request<ReadFileResult>({
            id: allocOpId(),
            kind: "readFile",
            path: ENTITY_LOCATION_FILE,
        });
        const eltBytes = new Uint8Array(reply.bytes);
        const nextIndex = Math.floor(eltBytes.byteLength / ELT_STRIDE);

        let capacity = 16;
        while (capacity < Math.max(nextIndex, 16)) capacity *= 2;
        const entities = new Int32Array(new ArrayBuffer(capacity * 2 * 4));
        const view = new DataView(eltBytes.buffer, eltBytes.byteOffset, eltBytes.byteLength);
        let freeListHead = -1;

        for (let entity = 0; entity < nextIndex; entity++) {
            const offset = entity * ELT_STRIDE;
            const archetypeId = view.getInt32(offset + 0, true);
            const rowIndex = view.getInt32(offset + 4, true);
            if (archetypeId === -1) {
                entities[entity * 2 + 0] = -1;
                entities[entity * 2 + 1] = freeListHead;
                freeListHead = entity;
            } else {
                entities[entity * 2 + 0] = archetypeId;
                entities[entity * 2 + 1] = rowIndex;
            }
        }

        return { entities, capacity, nextIndex, freeListHead };
    };

    /**
     * Read journal.bin, decode every entry, and apply only the
     * transactions that have a matching `commit` entry. The buffer
     * pattern (group by txId, apply on commit, drop the trailing
     * un-committed group) gives us crash-atomic replay: a crash
     * anywhere inside a transaction's append sequence loses the
     * commit marker, and the entire tx is dropped.
     *
     * Also advances `nextTxId` past every txId observed so newly-
     * emitted post-load entries don't recycle ids and collide on a
     * subsequent crash-recovery pass.
     */
    const replayJournal = async (manifest: Manifest, eltState: EltState): Promise<void> => {
        const reply = await transport.request<ReadFileResult>({
            id: allocOpId(),
            kind: "readFile",
            path: JOURNAL_FILE,
        });
        if (reply.bytes.byteLength === 0) return;
        const entries = decodeJournalStream(reply.bytes);
        if (entries.length === 0) return;

        let buffered: JournalEntry[] = [];
        let bufferedTxId: number | null = null;
        let maxTxId = 0;

        const flushIfMatch = (commitTxId: number): void => {
            if (bufferedTxId === commitTxId) {
                for (const e of buffered) applyJournalEntry(manifest, eltState, e);
            }
            buffered = [];
            bufferedTxId = null;
        };

        for (const entry of entries) {
            if (entry.txId > maxTxId) maxTxId = entry.txId;
            if (entry.kind === "commit") {
                flushIfMatch(entry.txId);
                continue;
            }
            if (bufferedTxId === null) {
                bufferedTxId = entry.txId;
            } else if (entry.txId !== bufferedTxId) {
                // A new tx started before the previous tx's commit
                // arrived — the previous tx is incomplete and must
                // be dropped.
                buffered = [];
                bufferedTxId = entry.txId;
            }
            buffered.push(entry);
        }
        // Trailing un-committed buffer is silently dropped.

        if (maxTxId >= nextTxId) nextTxId = maxTxId + 1;
    };

    const ensureEntityCapacity = (eltState: EltState, entity: number): void => {
        // Grow `entities` to fit `entity` if needed. The persistent
        // location table grows by *2; mirror that policy so any later
        // round-trip through fromData matches what create() would do.
        while (entity >= eltState.capacity) {
            const grown = new Int32Array(new ArrayBuffer(eltState.capacity * 2 * 2 * 4));
            grown.set(eltState.entities);
            eltState.entities = grown;
            eltState.capacity *= 2;
        }
        if (entity >= eltState.nextIndex) {
            // Any slots between the previous high-water-mark and this
            // entity were never allocated and become free-list entries.
            for (let slot = eltState.nextIndex; slot < entity; slot++) {
                eltState.entities[slot * 2 + 0] = -1;
                eltState.entities[slot * 2 + 1] = eltState.freeListHead;
                eltState.freeListHead = slot;
            }
            eltState.nextIndex = entity + 1;
        }
    };

    const applyJournalEntry = (manifest: Manifest, eltState: EltState, entry: JournalEntry): void => {
        if (entry.kind === "commit") return; // tx-end markers carry no state to apply
        if (entry.entity < 0) return; // ephemeral / sentinel — should not appear

        if (entry.kind === "delete") {
            ensureEntityCapacity(eltState, entry.entity);
            const prevArch = eltState.entities[entry.entity * 2 + 0]!;
            if (prevArch >= 0) {
                eltState.entities[entry.entity * 2 + 0] = -1;
                eltState.entities[entry.entity * 2 + 1] = eltState.freeListHead;
                eltState.freeListHead = entry.entity;
            }
            return;
        }

        // insert / update / migrate — set the location and re-apply
        // the component bytes.
        ensureEntityCapacity(eltState, entry.entity);
        const prevArch = eltState.entities[entry.entity * 2 + 0]!;
        eltState.entities[entry.entity * 2 + 0] = entry.archetypeId;
        eltState.entities[entry.entity * 2 + 1] = entry.rowIndex;
        if (prevArch === -1) {
            // Entity is moving out of the free list. Splice it out so
            // the free chain stays consistent. The list is short in
            // practice (bounded by the number of holes since the last
            // checkpoint), so a linear scan is fine.
            if (eltState.freeListHead === entry.entity) {
                eltState.freeListHead = eltState.entities[entry.entity * 2 + 1]!;
                eltState.entities[entry.entity * 2 + 1] = entry.rowIndex;
            } else {
                let cursor = eltState.freeListHead;
                while (cursor !== -1) {
                    const next = eltState.entities[cursor * 2 + 1]!;
                    if (next === entry.entity) {
                        eltState.entities[cursor * 2 + 1] = eltState.entities[entry.entity * 2 + 1]!;
                        eltState.entities[entry.entity * 2 + 1] = entry.rowIndex;
                        break;
                    }
                    cursor = next;
                }
            }
        }

        const aMan = manifest.archetypes[entry.archetypeId];
        if (aMan === undefined) return;
        const liveArchetype = store.archetypes[aMan.name];
        if (liveArchetype === undefined) return;
        const mutableArchetype = asMutableArchetype(liveArchetype);

        // Bump rowCount + capacity to fit the journaled row.
        if (entry.rowIndex >= mutableArchetype.rowCapacity) {
            let newCap = Math.max(mutableArchetype.rowCapacity, 16);
            while (entry.rowIndex >= newCap) newCap *= 2;
            for (const component of mutableArchetype.components) {
                const buffer = getColumn(mutableArchetype, component);
                if (buffer === undefined) continue;
                buffer.capacity = newCap;
            }
            mutableArchetype.rowCapacity = newCap;
        }
        if (entry.rowIndex >= mutableArchetype.rowCount) {
            mutableArchetype.rowCount = entry.rowIndex + 1;
        }

        // Re-apply the component payload. componentId 0 means "no
        // component" (e.g. an entity created with no components yet).
        if (entry.componentId === 0) return;
        const componentName = manifest.components[entry.componentId];
        if (componentName === undefined) return;
        if (componentName === "id") return;

        const colMan = aMan.columns[componentName];
        if (colMan === undefined) return;
        const buffer = getColumn(mutableArchetype, componentName);
        if (buffer === undefined) return;

        if (colMan.storage === "fixed") {
            if (entry.bytes.byteLength === 0) return;
            const ta = buffer.getTypedArray();
            const dest = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
            const offset = entry.rowIndex * colMan.stride;
            const writeLen = Math.min(entry.bytes.byteLength, dest.byteLength - offset);
            if (writeLen > 0) dest.set(entry.bytes.subarray(0, writeLen), offset);
        } else if (colMan.storage === "journal") {
            if (entry.bytes.byteLength === 0) return;
            try {
                const value: unknown = JSON.parse(new TextDecoder().decode(entry.bytes));
                // `buffer` is typed as `TypedBuffer<unknown>` here so
                // an `unknown` value assigns without a cast. The
                // runtime contract is the inverse of the encoder:
                // `JournalColumnEncoder.encodeRowValue` JSON-encodes
                // the live value, so JSON.parse round-trips back to
                // a value of the same shape the buffer expects.
                buffer.set(entry.rowIndex, value);
            } catch {
                // Corrupt JSON — skip this entry rather than crashing
                // the whole load. The column file (if present) still
                // reflects the last column-slice write.
            }
        }
        // storage === "manifest" carries no per-row payload.
    };

    /**
     * After journal replay, reconstruct each archetype's implicit `id`
     * column from the final ELT, then hand the rebuilt table back
     * through `store.fromData`.
     */
    const finalizeEntityLocationTable = (manifest: Manifest, eltState: EltState): void => {
        const { entities, nextIndex, capacity, freeListHead } = eltState;
        for (let entity = 0; entity < nextIndex; entity++) {
            const archetypeId = entities[entity * 2 + 0];
            if (archetypeId === undefined || archetypeId < 0) continue;
            const rowIndex = entities[entity * 2 + 1]!;
            const aMan = manifest.archetypes[archetypeId];
            if (aMan === undefined) continue;
            const liveArchetype = store.archetypes[aMan.name];
            if (liveArchetype === undefined) continue;
            const idColumn = getIdColumn(liveArchetype);
            if (idColumn === undefined) continue;
            idColumn.set(rowIndex, entity);
        }

        store.fromData({
            componentSchemas: {},
            entityLocationTableData: { entities, freeListHead, nextIndex, capacity },
            archetypesData: [],
        });
    };

    const dispose = async (): Promise<void> => {
        if (unsubscribe !== null) {
            unsubscribe();
            unsubscribe = null;
        }
        if (idleTimer !== null) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        if (checkpointInFlight !== null) await checkpointInFlight;
        offMessage();
        errorListeners.clear();
        if (ownsTransport) await transport.close();
    };

    return {
        serviceName: "WorkerPersistenceService",
        save,
        load,
        checkpoint: doCheckpoint,
        flush: () => transport.flush(),
        dispose,
    };
};
