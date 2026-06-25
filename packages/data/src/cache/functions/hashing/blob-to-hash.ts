// © 2026 Adobe. MIT License. See /LICENSE for details.

// Performance assumptions
// -----------------------
// Blobs hashed here are frequently NOT fully in memory (disk- or
// stream-backed), so each `reader.read()` is genuine I/O latency, not a
// microtask hop over resident bytes. This makes the path I/O-bound, and the
// design optimizes for overlapping those waits across concurrent calls:
//
//   - A single WASM hasher instance is reused for every call (instantiation
//     is not free, and we don't want one per call).
//   - Concurrency is achieved via hash-wasm's resumable save()/load() rather
//     than a pool of instances: each call keeps its own `state` and only
//     touches the shared instance in synchronous critical sections, so calls
//     interleave at `read()` without serializing or corrupting each other.
//
// The trade-off is a save()/load() pair per chunk (cheap for SHA-256). If
// blobs were instead known to be fully in memory, this would be compute-bound,
// the I/O overlap would buy nothing, and buffering then hashing synchronously
// (one init→update→digest block, no await) would suffice.
//
// Note on the "single global hasher" decision: even compute-bound, extra
// instances would NOT help on this thread. WASM has no threads of its own and
// hasher.update() is synchronous, so on one JS thread only one hash advances
// at a time regardless of how many instances exist — a pool buys nothing here.
// Servicing multiple CPU-bound hashes truly in parallel requires Web Workers,
// each with its OWN instance on its OWN thread. That is the only thing a second
// instance is ever good for, and it lives at the worker boundary, not here. So
// within this thread, one global hasher is strictly correct and loses nothing.
import { type IHasher, createSHA256 } from "hash-wasm";

let hasherPromise: Promise<IHasher> | undefined;

export async function blobToHash(blob: Blob): Promise<string> {
  if (hasherPromise === undefined) {
    hasherPromise = createSHA256();
    // Allow a later call to retry if instantiation failed, rather than
    // poisoning the module with a permanently-rejected promise.
    hasherPromise.catch(() => {
      hasherPromise = undefined;
    });
  }
  const hasher = await hasherPromise;

  // One shared WASM instance serves all concurrent calls. The instance is
  // touched only in synchronous init→…→save / load→update→save sequences,
  // never held across an `await`, so each call carries its own `state` and
  // their `reader.read()` I/O waits overlap freely without corrupting one
  // another. See hash-wasm save()/load() resumable hashing.
  hasher.init();
  hasher.update(mimeTypeBytes(blob.type));
  let state = hasher.save();

  const reader = blob.stream().getReader();
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done === true;
    if (!done && chunk.value != null) {
      hasher.load(state);
      hasher.update(chunk.value);
      state = hasher.save();
    }
  }

  hasher.load(state);
  return hasher.digest("hex");
}

function mimeTypeBytes(type: string): Uint8Array {
  // Encode MIME type as UTF-16LE
  const codes = new Uint16Array(type.length);
  for (let i = 0; i < type.length; i++) {
    codes[i] = type.charCodeAt(i);
  }
  return new Uint8Array(codes.buffer);
}
