// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Manifest written to `meta.json` describing the on-disk layout for a
 * specific database snapshot. Versioned for forward-compatible schema
 * evolution.
 */
export interface Manifest {
    readonly version: 1;
    readonly checkpointId: number;
    readonly archetypes: { readonly [archetypeId: number]: ArchetypeManifest };
    /** Entity → archetypeId,rowIndex packed file metadata. */
    readonly entityLocation: { readonly stride: number };
    /**
     * Component intern table: numeric componentId → component name. Journal
     * entries reference components by id (u16) for fixed binary header
     * size; this table lets the loader map ids back to live column names
     * during journal replay.
     */
    readonly components: { readonly [componentId: number]: string };
}

export interface ArchetypeManifest {
    readonly id: number;
    readonly name: string;
    readonly rowCount: number;
    readonly rowCapacity: number;
    readonly columns: { readonly [component: string]: ColumnManifest };
}

export interface ColumnManifest {
    readonly component: string;
    /** Bytes per row for fixed-stride columns, or 0 for journal-only columns. */
    readonly stride: number;
    /** "fixed" stores in column file; "journal" stores in journal entries only. */
    readonly storage: "fixed" | "journal" | "manifest";
    /** TypedBufferType from @adobe/data, kept as a string to avoid importing classes. */
    readonly bufferType: "number" | "struct" | "enum" | "const" | "array";
}

/**
 * A slice of column bytes ready to be transferred to the worker. The
 * `bytes` ArrayBuffer is intended for zero-copy postMessage transfer.
 */
export interface EncodedColumnSlice {
    readonly archetypeId: number;
    readonly component: string;
    readonly rowOffset: number;
    readonly bytes: ArrayBuffer;
}

/**
 * Per-column encoder. Selected at archetype-registration time based on
 * the column's underlying TypedBufferType.
 */
export interface ColumnEncoder {
    readonly storage: ColumnManifest["storage"];
    readonly stride: number;
    /**
     * Encode a contiguous range of rows into a transferable buffer.
     * Returns null when the column type stores nothing per row (const).
     */
    encodeRows(
        rowStart: number,
        rowCount: number,
    ): EncodedColumnSlice["bytes"] | null;
    /**
     * For variable-length columns, encode a single row's value as JSON
     * bytes for inclusion in a journal entry.
     */
    encodeRowValue(rowIndex: number): Uint8Array | null;
}
