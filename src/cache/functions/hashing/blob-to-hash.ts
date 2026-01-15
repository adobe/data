// © 2026 Adobe. MIT License. See /LICENSE for details.
import { arrayBufferToHex } from "./array-buffer-to-hex.js";
import { bufferToHash } from "./buffer-to-hash.js";

/**
 * Converts a Blob to a hash using the blob content and type using SHA-256.
 */
/**
 * Converts a Blob to a SHA-256 hash.  
 * • Uses the streaming `crypto.DigestStream` API when present (no large buffers).  
 * • Falls back to the original buffer-based approach otherwise.
 */
export async function blobToHash(blob: Blob): Promise<string> {
  // ── 1. Streamed path
  if ("DigestStream" in crypto) {
    const digestStream = new (crypto as any).DigestStream("SHA-256");

    // Encode the MIME-type as UTF-16LE
    const tCodes = new Uint16Array(blob.type.length);
    for (let i = 0; i < blob.type.length; i++) tCodes[i] = blob.type.charCodeAt(i);
    const tBytes = new Uint8Array(tCodes.buffer);

    // Feed type + blob chunks into the hash
    const writer = digestStream.writable.getWriter();
    await writer.write(tBytes);

    const reader = blob.stream().getReader();
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (!done) {
        await writer.write(result.value!);
      }
    }
    await writer.close();

    const hashBuf = await digestStream.digest;
    return arrayBufferToHex(hashBuf);
  }

  // ── 2. Fallback
  const { type } = blob;
  const typeByteLength = type.length * 2;
  const buffer = new ArrayBuffer(typeByteLength + blob.size);

  // Write the MIME-type (UTF-16LE) into the first part of the buffer
  const charView = new Uint16Array(buffer, 0, type.length);
  for (let i = 0; i < type.length; i++) charView[i] = type.charCodeAt(i);

  // Append the blob bytes
  const byteView = new Uint8Array(buffer);
  const blobArrayBuffer = await blob.arrayBuffer();
  byteView.set(new Uint8Array(blobArrayBuffer), typeByteLength);

  // Hash the combined buffer
  return bufferToHash(buffer);
}

