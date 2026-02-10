// © 2026 Adobe. MIT License. See /LICENSE for details.
import { bufferToHash } from "./buffer-to-hash.js";

function stringToArrayBuffer(value: string): ArrayBuffer {
  const buf = new ArrayBuffer(value.length * 2);
  const view = new Uint16Array(buf);
  for (let i = 0, strLen = value.length; i < strLen; i++) {
    view[i] = value.charCodeAt(i);
  }
  return buf;
}

/**
 * Converts a string to a hash using SHA-256.
 */
export async function stringToHash(value: string): Promise<string> {
  return bufferToHash(stringToArrayBuffer(value));
}
