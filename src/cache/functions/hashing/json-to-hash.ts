// © 2026 Adobe. MIT License. See /LICENSE for details.
import { stringToHash } from "./string-to-hash.js";

/**
 * Converts a JSON object to a hash using SHA-256.
 */
export async function jsonToHash(value: unknown): Promise<string> {
  return stringToHash(JSON.stringify(value));
}
