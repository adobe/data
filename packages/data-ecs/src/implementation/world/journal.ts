/**
 * Entity indexes whose archetype or references sync points changed: spawned, despawned, moved to another archetype,
 * or written a reference. Kept only while some reader, an `up` system or query observers, needs it. Positions count every index ever
 * appended, so each reader keeps its own; a position before `first` lost entries, which a reader then rebuilds from.
 */
export type Journal = {
    indexes: Int32Array;
    length: number;
    /** The position of `indexes[0]`. */
    first: number;
    readers: number;
};

export const createJournal = (): Journal => ({ indexes: new Int32Array(0), length: 0, first: 0, readers: 0 });

/** The position after the last entry. */
export const journalEnd = (journal: Journal): number => journal.first + journal.length;

/**
 * Appends an entity index, once some reader exists. Past `limit` entries the journal drops them: a reader behind
 * then rebuilds, which costs about what reading that many entries would.
 */
export const record = (journal: Journal, index: number, limit: number): void => {
    if (journal.readers === 0) return;
    if (journal.length >= Math.max(4096, limit)) {
        journal.first += journal.length;
        journal.length = 0;
    }
    if (journal.length === journal.indexes.length) {
        const grown = new Int32Array(Math.max(1024, 2 * journal.indexes.length));
        grown.set(journal.indexes);
        journal.indexes = grown;
    }
    journal.indexes[journal.length++] = index;
};
