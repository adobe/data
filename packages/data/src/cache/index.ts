// © 2026 Adobe. MIT License. See /LICENSE for details.

export {
  type BlobStore,
  BlobRef,
  blobStore,
  isBlobRef,
  BlobRefSchema,
} from "./blob-store.js";
export { getDataCache, type DataCache } from "./data-cache.js";
export {
  type MemoryAllocator,
  createSimpleMemoryAllocator,
  createWasmMemoryAllocator,
  createSharedArrayBufferAllocator,
  isSharedArrayBufferAllocatorSupported,
  defaultMemoryAllocator,
  type SharedArrayBufferAllocatorOptions,
} from "./memory-allocator.js";
export * from "./functions/index.js";
