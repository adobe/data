// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createSHA256 } from "hash-wasm";

export async function blobToHashStreaming(blob: Blob): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();

  // Encoding as UTF-16LE to match blobToHash
  const tCodes = new Uint16Array(blob.type.length);
  for (let i = 0; i < blob.type.length; i++){
    tCodes[i] = blob.type.charCodeAt(i);
  }
  hasher.update(new Uint8Array(tCodes.buffer));

  const reader = blob.stream().getReader();
  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done === true;
    if (!done && result.value != null) {
      hasher.update(result.value);
    }
  }

  return hasher.digest("hex");
}
