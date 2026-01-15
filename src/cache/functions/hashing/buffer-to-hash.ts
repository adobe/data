// © 2026 Adobe. MIT License. See /LICENSE for details.
import { arrayBufferToHex } from "./array-buffer-to-hex.js";

/**
 * Converts an ArrayBuffer to a hash using SHA-256.
 */
export async function bufferToHash(buffer: ArrayBuffer): Promise<string> {
  return arrayBufferToHex(await crypto.subtle.digest("SHA-256", buffer));
}
