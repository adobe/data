// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Wire codes for each journal entry kind. This is the single source of
 * truth — `JournalEntryKind` and `JournalEntryKindName` are both
 * derived from it so they can never drift.
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
export const JournalEntryKindCode = {
    insert: 1,
    update: 2,
    delete: 3,
    migrate: 4,
    commit: 5,
} as const;

export type JournalEntryKind = keyof typeof JournalEntryKindCode;

export const JournalEntryKindName = Object.fromEntries(
    Object.entries(JournalEntryKindCode).map(([name, code]) => [code, name]),
) as Readonly<Record<number, JournalEntryKind>>;

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
