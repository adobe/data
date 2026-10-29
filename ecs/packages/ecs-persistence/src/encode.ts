// © 2026 Adobe. MIT License. See /LICENSE for details.
import { encodeContents } from "./format/format.js";
import { contents } from "./program/contents.js";
import type { Snapshot } from "./snapshot.js";

/**
 * A snapshot as bytes, little-endian: a header naming each persisted component and resource with its schema, then
 * 8-byte-aligned blocks of each table's entities and columns, its bytes columns copied whole.
 */
export const encode = (snapshot: Snapshot): Uint8Array => encodeContents(snapshot[contents]);
