// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Entity } from "@adobe/data/ecs";
import { createTypedBuffer, type TypedBuffer, type TypedBufferType } from "@adobe/data/typed-buffer";
import { encodeStoredRows } from "./stored-entity-rows.js";
import type { ColumnEncoder, ColumnManifest } from "./types.js";

// Implementation note (V8 hidden classes / monomorphic IC):
//
// The hot path calls `encoder.encodeRows(...)` and
// `encoder.encodeRowValue(...)` once per touched component per
// changed entity per transaction. With one fresh closure-shaped
// encoder object per archetype × column, the IC at those call sites
// goes polymorphic → megamorphic almost immediately. We therefore
// implement encoders as classes so every "fixed" encoder shares one
// hidden class and every "journal" encoder shares another. See
// `.claude/skills/performance/SKILL.md` and
// `packages/data/src/typed-buffer/create-number-buffer.ts` for the
// pattern this mirrors.
//
// Public-API discipline: the classes are NOT exported. Consumers see
// only the `ColumnEncoder` interface and the `createColumnEncoder`
// factory; nothing in the calling code uses `instanceof`.

const FIXED_STORAGE: ColumnManifest["storage"] = "fixed";
const CONST_STORAGE: ColumnManifest["storage"] = "manifest";
const JOURNAL_STORAGE: ColumnManifest["storage"] = "journal";

class FixedColumnEncoder implements ColumnEncoder {
    public readonly storage: ColumnManifest["storage"] = FIXED_STORAGE;
    public readonly stride: number;
    public readonly bufferType: TypedBufferType;
    private readonly buffer: TypedBuffer<unknown>;
    private readonly elementsPerRow: number;

    constructor(buffer: TypedBuffer<unknown>) {
        this.buffer = buffer;
        this.bufferType = buffer.type;
        this.stride = buffer.typedArrayElementSizeInBytes;
        // Hoist the per-row element count out of the hot loop. Every
        // typed-array view we slice goes through this multiplier; it
        // never changes for a given column, so cache it on the
        // instance once.
        this.elementsPerRow = this.stride / buffer.getTypedArray().BYTES_PER_ELEMENT;
    }

    encodeRows(rowStart: number, rowCount: number): ArrayBuffer | null {
        return this.encodeFixed(rowStart, rowCount);
    }

    // Fixed-stride columns DO populate journal payloads — the column
    // slice file write is a fast-load snapshot optimization, the
    // journal is the WAL and must carry the row bytes so crash
    // recovery can repair partial column writes.
    encodeRowValue(rowIndex: number): Uint8Array | null {
        const out = this.encodeFixed(rowIndex, 1);
        return new Uint8Array(out);
    }

    private encodeFixed(rowStart: number, rowCount: number): ArrayBuffer {
        const typedArray = this.buffer.getTypedArray();
        const startElement = rowStart * this.elementsPerRow;
        const endElement = startElement + rowCount * this.elementsPerRow;
        const view = typedArray.subarray(startElement, endElement);
        const out = new ArrayBuffer(view.byteLength);
        new Uint8Array(out).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        return out;
    }
}

// A fixed-stride column holding entity ids, written in their stored (i32) form.
class StoredEntityColumnEncoder implements ColumnEncoder {
    public readonly storage: ColumnManifest["storage"] = FIXED_STORAGE;
    public readonly stride: number;
    public readonly bufferType: TypedBufferType;
    private readonly buffer: TypedBuffer<unknown>;

    constructor(buffer: TypedBuffer<unknown>, stored: TypedBuffer<unknown>) {
        this.buffer = buffer;
        this.stride = stored.typedArrayElementSizeInBytes;
        this.bufferType = stored.type;
    }

    encodeRows(rowStart: number, rowCount: number): ArrayBuffer | null {
        return encodeStoredRows(this.buffer, rowStart, rowCount);
    }

    encodeRowValue(rowIndex: number): Uint8Array | null {
        return new Uint8Array(encodeStoredRows(this.buffer, rowIndex, 1));
    }
}

class ConstColumnEncoder implements ColumnEncoder {
    public readonly storage: ColumnManifest["storage"] = CONST_STORAGE;
    public readonly stride: number = 0;
    public readonly bufferType: TypedBufferType = "const";

    encodeRows(): ArrayBuffer | null {
        return null;
    }

    encodeRowValue(): Uint8Array | null {
        return null;
    }
}

class JournalColumnEncoder implements ColumnEncoder {
    public readonly storage: ColumnManifest["storage"] = JOURNAL_STORAGE;
    public readonly stride: number = 0;
    public readonly bufferType: TypedBufferType;
    private readonly buffer: TypedBuffer<unknown>;
    // TextEncoder is cheap to construct but not free; reuse one per
    // encoder instance. (TextEncoder has no internal state that would
    // pose a thread-safety issue here — the worker-side replay does
    // its own decoding through a separate instance.)
    private readonly textEncoder: TextEncoder;

    constructor(buffer: TypedBuffer<unknown>) {
        this.buffer = buffer;
        this.bufferType = buffer.type;
        this.textEncoder = new TextEncoder();
    }

    encodeRows(): ArrayBuffer | null {
        return null;
    }

    encodeRowValue(rowIndex: number): Uint8Array | null {
        // Entity ids are written in their stored (i32) form.
        const value = Entity.toStoredValue(this.buffer.get(rowIndex), this.buffer.schema);
        return this.textEncoder.encode(JSON.stringify(value));
    }
}

/**
 * Build a {@link ColumnEncoder} for a given TypedBuffer. The buffer's
 * `type` (number / struct / enum / const / array) selects the strategy:
 *
 *   number / struct / enum  - fixed-stride; encoded as a copy of the
 *                             relevant slice of the underlying TypedArray.
 *   boolean                 - bit-packed in memory; per-row JSON in the journal.
 *   const                   - nothing per row; manifest carries the value.
 *   array                   - variable-length; per-row JSON into the journal.
 *
 * The `componentName` is used for diagnostics only.
 */
export const createColumnEncoder = (
    componentName: string,
    buffer: TypedBuffer<unknown>,
): ColumnEncoder => {
    if (buffer.type !== "const" && Entity.hasEntity(buffer.schema)) {
        // Encode by the stored schema's buffer type, which is what 0.10.x wrote.
        const stored = createTypedBuffer(Entity.toStoredSchema(buffer.schema), 1);
        if (stored.type === "number" || stored.type === "struct" || stored.type === "enum") {
            return new StoredEntityColumnEncoder(buffer, stored);
        }
        return new JournalColumnEncoder(buffer);
    }
    const bufferType: TypedBufferType = buffer.type;
    switch (bufferType) {
        case "number":
        case "struct":
        case "enum":
            return new FixedColumnEncoder(buffer);
        case "const":
            return new ConstColumnEncoder();
        case "boolean":
        case "array":
            return new JournalColumnEncoder(buffer);
        default: {
            const exhaustive: never = bufferType;
            throw new Error(`Unsupported TypedBuffer type for encoder: ${String(exhaustive)} (component=${componentName})`);
        }
    }
};
