// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Kinds of mutations recorded in the journal.
 *
 *   insert  - a new row was inserted into an archetype
 *   update  - an existing row was updated
 *   delete  - an entity was deleted
 *   migrate - an entity moved from one archetype to another
 *   commit  - end-of-transaction marker. Carries no per-row payload;
 *             its presence at txId T tells the replayer that all
 *             entries for T are durable. Replay buffers data entries
 *             by txId and only applies a tx once its commit entry is
 *             seen — torn tails (incomplete tx never reached commit)
 *             are dropped wholesale, preserving transactional
 *             atomicity across crashes.
 */
export type JournalEntryKind = "insert" | "update" | "delete" | "migrate" | "commit";

export const JournalEntryKindCode = {
    insert: 1,
    update: 2,
    delete: 3,
    migrate: 4,
    commit: 5,
} as const;

export const JournalEntryKindName: Readonly<Record<number, JournalEntryKind>> = {
    1: "insert",
    2: "update",
    3: "delete",
    4: "migrate",
    5: "commit",
};

/**
 * A single journal entry. Variable-length payloads (`bytes`) are JSON
 * for variable-length columns, or empty for delete/migrate.
 *
 * Wire format (little-endian):
 *
 *   u32 txId
 *   f64 timestampMs
 *   u8  kindCode
 *   i32 entity            (signed; the affected entity id)
 *   u16 archetypeId       (0 for delete entries — entity has no archetype)
 *   u32 rowIndex          (0 for delete entries)
 *   u16 componentId       (0 when not applicable, e.g. delete)
 *   u32 byteLen
 *   bytes... (byteLen bytes)
 *
 * Total fixed-header size: 29 bytes.
 *
 * `entity` is required for crash-recovery replay: after restoring the
 * checkpoint snapshot, the journal carries the entity → (archetype, row)
 * mapping for everything that happened since, plus the per-row column
 * bytes needed to reconstruct any partially-written rows.
 */
export interface JournalEntry {
    readonly txId: number;
    readonly timestampMs: number;
    readonly kind: JournalEntryKind;
    /** The entity affected by this entry. */
    readonly entity: number;
    readonly archetypeId: number;
    readonly rowIndex: number;
    /** Numeric id from the manifest's component intern table (0 = none). */
    readonly componentId: number;
    /** JSON-encoded payload for variable-length columns; empty otherwise. */
    readonly bytes: Uint8Array;
}

export const JOURNAL_HEADER_BYTES = 29;
