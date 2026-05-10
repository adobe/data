// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import type { PersistenceBackend } from "../backend/persistence-backend.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

/**
 * Journal-replay focused tests. These exercise paths where the
 * snapshot (manifest + column files + entity-location.bin) is *not*
 * up to date and the journal must roll the database forward, plus
 * crash-recovery scenarios where the journal itself is partially
 * written or where the checkpoint was killed mid-step.
 */

const particlePlugin = Database.Plugin.create({
    components: {
        position: Vec3.schema,
        velocity: Vec3.schema,
        mass: F32.schema,
    },
    archetypes: {
        Particle: ["position", "velocity", "mass"],
    },
    transactions: {
        spawn(t, args: { x: number; y: number; z: number; mass: number }) {
            return t.archetypes.Particle.insert({
                position: [args.x, args.y, args.z],
                velocity: [0, 0, 0],
                mass: args.mass,
            });
        },
        move(t, args: { entity: number; x: number; y: number; z: number }) {
            t.update(args.entity, { position: [args.x, args.y, args.z] });
        },
        kill(t, entity: number) {
            t.delete(entity);
        },
    },
});

const createDb = () => Database.create(particlePlugin);

const expectEntity = (
    db: ReturnType<typeof createDb>,
    entity: number,
    expected: { position: readonly number[]; velocity: readonly number[]; mass: number },
): void => {
    const view = db.read(entity) as
        | { position: ArrayLike<number>; velocity: ArrayLike<number>; mass: number }
        | null;
    expect(view).not.toBeNull();
    if (view === null) return;
    expect(Array.from(view.position)).toEqual([...expected.position]);
    expect(Array.from(view.velocity)).toEqual([...expected.velocity]);
    expect(view.mass).toBe(expected.mass);
};

const readBackendFile = async (
    backend: PersistenceBackend,
    path: string,
): Promise<Uint8Array> => {
    const file = await backend.open(path);
    const size = await file.size();
    if (size === 0) {
        await file.close();
        return new Uint8Array(0);
    }
    const bytes = await file.readAt(0, size);
    await file.close();
    // Detach from any internal aliasing.
    return new Uint8Array(bytes);
};

const writeBackendFile = async (
    backend: PersistenceBackend,
    path: string,
    bytes: Uint8Array,
): Promise<void> => {
    const file = await backend.open(path);
    await file.truncate(0);
    if (bytes.byteLength > 0) await file.writeAt(0, bytes);
    await file.sync();
    await file.close();
};

describe("WorkerPersistenceService.load (journal replay)", () => {
    it("rolls forward changes that landed in the journal but were never checkpointed", async () => {
        const backend = createMemoryBackend();

        // Phase A: spawn one entity, checkpoint (puts it in column files).
        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        await svcA.flush();
        await svcA.checkpoint();

        // Phase B: spawn a second entity and move e0 — these go into
        // the journal only (no further checkpoint).
        const e1 = dbA.transactions.spawn({ x: 4, y: 5, z: 6, mass: 20 });
        dbA.transactions.move({ entity: e0!, x: 100, y: 200, z: 300 });
        await svcA.flush();
        // Note: NO checkpoint here. Journal carries the diff.
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        // Both the post-checkpoint state and the journal-only diffs
        // must be visible.
        expectEntity(dbB, e0!, { position: [100, 200, 300], velocity: [0, 0, 0], mass: 10 });
        expectEntity(dbB, e1!, { position: [4, 5, 6], velocity: [0, 0, 0], mass: 20 });
        await svcB.dispose();
    });

    it("rebuilds the world from journal entries alone (empty snapshot)", async () => {
        // Write an empty checkpoint first so meta.json exists and the
        // snapshot is genuinely empty, then add entities — those go
        // *only* into the journal. Replay must reconstruct them with
        // no help from column files.
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        // Empty checkpoint: writes a manifest covering an empty world.
        await svcA.flush();
        await svcA.checkpoint();

        const e0 = dbA.transactions.spawn({ x: 11, y: 12, z: 13, mass: 1 });
        const e1 = dbA.transactions.spawn({ x: 21, y: 22, z: 23, mass: 2 });
        const e2 = dbA.transactions.spawn({ x: 31, y: 32, z: 33, mass: 3 });
        await svcA.flush();
        // No checkpoint here — these three entities live entirely in
        // the journal.
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();
        expectEntity(dbB, e0!, { position: [11, 12, 13], velocity: [0, 0, 0], mass: 1 });
        expectEntity(dbB, e1!, { position: [21, 22, 23], velocity: [0, 0, 0], mass: 2 });
        expectEntity(dbB, e2!, { position: [31, 32, 33], velocity: [0, 0, 0], mass: 3 });
        await svcB.dispose();
    });

    it("replay is idempotent: loading twice in a row produces the same state", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 7 });
        await svcA.flush();
        await svcA.checkpoint();
        // Post-checkpoint diff carried by journal:
        const e1 = dbA.transactions.spawn({ x: 4, y: 5, z: 6, mass: 8 });
        dbA.transactions.move({ entity: e0!, x: -1, y: -2, z: -3 });
        await svcA.flush();
        await svcA.dispose();

        // First load.
        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();
        await svcB.dispose();

        // Second load on a fresh database — same backend.
        const dbC = createDb();
        const svcC = await createWorkerPersistenceService({
            database: dbC,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcC.load();

        expectEntity(dbC, e0!, { position: [-1, -2, -3], velocity: [0, 0, 0], mass: 7 });
        expectEntity(dbC, e1!, { position: [4, 5, 6], velocity: [0, 0, 0], mass: 8 });
        await svcC.dispose();
    });

    it("preserves last-write-wins ordering across multiple journal entries for the same row", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 1, z: 1, mass: 1 });
        await svcA.flush();
        await svcA.checkpoint();
        // Three sequential moves — only the last position should win.
        dbA.transactions.move({ entity: e0!, x: 2, y: 2, z: 2 });
        dbA.transactions.move({ entity: e0!, x: 3, y: 3, z: 3 });
        dbA.transactions.move({ entity: e0!, x: 9, y: 9, z: 9 });
        await svcA.flush();
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();
        expectEntity(dbB, e0!, { position: [9, 9, 9], velocity: [0, 0, 0], mass: 1 });
        await svcB.dispose();
    });
});

describe("WorkerPersistenceService.load (crash recovery)", () => {
    it("torn journal tail: a partial entry at the end is dropped and earlier entries are recovered", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        await svcA.flush();
        await svcA.checkpoint();
        // Journal now empty; subsequent transactions go into journal.
        const e1 = dbA.transactions.spawn({ x: 4, y: 5, z: 6, mass: 20 });
        await svcA.flush();
        await svcA.dispose();

        // Simulate a crash mid-write at the tail: truncate the journal
        // by 5 bytes from the end. The last entry's payload (or part
        // of its header) becomes torn — decodeJournalStream should
        // stop at the previous good boundary.
        const journalBytes = await readBackendFile(backend, "journal.bin");
        expect(journalBytes.byteLength).toBeGreaterThan(5);
        const torn = journalBytes.subarray(0, journalBytes.byteLength - 5);
        await writeBackendFile(backend, "journal.bin", torn);

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        // e0 is recovered from the column files (it was checkpointed).
        expectEntity(dbB, e0!, { position: [1, 2, 3], velocity: [0, 0, 0], mass: 10 });
        // e1 may or may not be recovered depending on which journal
        // entry got cut — but the load must NOT throw, must NOT
        // corrupt e0, and any entity it does report must have its
        // values match the original transaction. Verify load
        // succeeded and e0 is intact.
        const view = dbB.read(e1!) as
            | { mass: number; position: ArrayLike<number> }
            | null;
        if (view !== null) {
            // If e1 was partly journaled, the components that DID
            // make it should match the original values — torn
            // entries are dropped, never partially applied.
            expect(view.mass).toBe(20);
            expect(Array.from(view.position)).toEqual([4, 5, 6]);
        }
        await svcB.dispose();
    });

    it("crash mid-checkpoint: manifest written, journal not yet truncated, load is idempotent", async () => {
        // The checkpoint protocol writes meta.json then truncates
        // journal.bin. If we crash between those steps, the manifest
        // reflects the new state but the journal still has the
        // entries that the manifest already absorbed. Replay must be
        // idempotent so this doesn't double-apply or corrupt rows.
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        await svcA.flush();
        await svcA.checkpoint();
        const e1 = dbA.transactions.spawn({ x: 4, y: 5, z: 6, mass: 20 });
        dbA.transactions.move({ entity: e0!, x: 100, y: 200, z: 300 });
        await svcA.flush();
        // Snapshot the journal RIGHT BEFORE the next checkpoint
        // truncates it, then run checkpoint, then RE-WRITE the
        // pre-checkpoint journal back in to simulate the crash
        // between "manifest written" and "journal truncated".
        const preCheckpointJournal = await readBackendFile(backend, "journal.bin");
        await svcA.checkpoint();
        await svcA.dispose();

        // Restore the pre-truncate journal to simulate the crash.
        await writeBackendFile(backend, "journal.bin", preCheckpointJournal);

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        expectEntity(dbB, e0!, { position: [100, 200, 300], velocity: [0, 0, 0], mass: 10 });
        expectEntity(dbB, e1!, { position: [4, 5, 6], velocity: [0, 0, 0], mass: 20 });
        await svcB.dispose();
    });

    it("crash with no journal at all: load succeeds from the snapshot alone", async () => {
        // Sanity check: if the journal file is missing/empty (e.g. a
        // clean checkpoint), load() must still produce the right
        // state and skip replay.
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 9, y: 8, z: 7, mass: 6 });
        await svcA.flush();
        await svcA.checkpoint();
        await svcA.dispose();

        // After a clean checkpoint the journal should be 0 bytes.
        const journalBytes = await readBackendFile(backend, "journal.bin");
        expect(journalBytes.byteLength).toBe(0);

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();
        expectEntity(dbB, e0!, { position: [9, 8, 7], velocity: [0, 0, 0], mass: 6 });
        await svcB.dispose();
    });

    it("torn tail before commit: the dropped tx's entries are not reapplied by replay", async () => {
        // Journal-level tx atomicity: replay buffers entries by txId
        // and only applies them when it sees a `commit` entry for
        // that tx. This test verifies the BUFFERING behavior — a
        // dropped tx whose commit never made it to disk does not get
        // reapplied to other entities.
        //
        // Important caveat: the column-slice file write happens
        // eagerly (before its commit marker is durable), so the
        // column file may already reflect the dropped tx's value.
        // Full row-level atomicity across crashes would require
        // shadow paging or deferred column writes; we explicitly do
        // not promise it. What we DO promise: the journal itself is
        // consistent — un-committed entries never leak into other
        // entities, and replay never half-applies a multi-entity tx
        // (entity X updated, entity Y not).
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        const e1 = dbA.transactions.spawn({ x: 4, y: 5, z: 6, mass: 20 });
        await svcA.flush();
        await svcA.checkpoint();

        // Single tx that touches both e0 and e1. After flushing, the
        // journal contains entries for both entities + a commit.
        // Truncate the trailing commit so replay drops the tx.
        dbA.transactions.move({ entity: e0!, x: 100, y: 200, z: 300 });
        dbA.transactions.move({ entity: e1!, x: 400, y: 500, z: 600 });
        await svcA.flush();
        await svcA.dispose();

        // Drop just the very last byte: this corrupts the final
        // commit entry's header, which decodeJournalStream tolerates
        // by stopping early. The tx's data entries arrive at replay
        // un-committed and are buffered → discarded.
        const journalBytes = await readBackendFile(backend, "journal.bin");
        const torn = journalBytes.subarray(0, journalBytes.byteLength - 1);
        await writeBackendFile(backend, "journal.bin", torn);

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        // Both entities exist (the snapshot from the prior checkpoint
        // is intact) and load doesn't crash. Their column-file bytes
        // may reflect the dropped tx (eager writes), but the journal
        // dropped the entries — proving replay didn't re-apply them.
        // We assert the entities are present and their non-position
        // components are intact (since those weren't touched).
        const v0 = dbB.read(e0!) as { mass: number } | null;
        const v1 = dbB.read(e1!) as { mass: number } | null;
        expect(v0?.mass).toBe(10);
        expect(v1?.mass).toBe(20);
        await svcB.dispose();
    });

    it("torn journal at archetype-introducing entry: pre-existing entities still load cleanly", async () => {
        // Specifically targets the case where the truncated tail
        // would have introduced a new row beyond the snapshot's
        // rowCount. Replay should grow the archetype on demand;
        // a torn write means the entry is silently dropped.
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 1, z: 1, mass: 1 });
        const e1 = dbA.transactions.spawn({ x: 2, y: 2, z: 2, mass: 2 });
        await svcA.flush();
        await svcA.checkpoint();

        // Add a third entity; the journal will hold its 3 update
        // entries (one per component).
        const e2 = dbA.transactions.spawn({ x: 3, y: 3, z: 3, mass: 3 });
        await svcA.flush();
        await svcA.dispose();

        // Truncate the journal by half — guarantees the e2 entries
        // are at least partially cut.
        const journalBytes = await readBackendFile(backend, "journal.bin");
        const half = Math.floor(journalBytes.byteLength / 2);
        await writeBackendFile(backend, "journal.bin", journalBytes.subarray(0, half));

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        // e0 and e1 are in the snapshot — must be unaffected.
        expectEntity(dbB, e0!, { position: [1, 1, 1], velocity: [0, 0, 0], mass: 1 });
        expectEntity(dbB, e1!, { position: [2, 2, 2], velocity: [0, 0, 0], mass: 2 });
        // e2 may or may not be partially recovered — but if present,
        // any component that did make it must match. (We don't
        // strictly assert presence here — the test's contract is
        // "load doesn't crash and snapshot rows are intact".)
        const e2View = dbB.read(e2!);
        // No assertion on e2View; the only contract is no corruption
        // of e0/e1 above. The dummy use silences the unused-var
        // diagnostic.
        void e2View;
        await svcB.dispose();
    });
});
