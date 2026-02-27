// © 2026 Adobe. MIT License. See /LICENSE for details.
import { getManagedPersistentCache } from "./get-persistent-cache.js";
import { type Schema } from "../schema/index.js";
import { blobToHash } from "./functions/hashing/blob-to-hash.js";
import { preventParallelExecution } from "./functions/prevent-parallel-execution.js";

const remoteUrlPrefix = "http";
const RemoteUrlSchema = {
  type: "string",
  pattern: `${remoteUrlPrefix}.*`,
} as const satisfies Schema;
type RemoteUrl = `${typeof remoteUrlPrefix}${string}`;

const RemoteBlobRefSchema = {
  required: ["remoteBlobRef"],
  properties: {
    remoteBlobRef: RemoteUrlSchema,
  },
  additionalProperties: false,
} as const satisfies Schema;
type RemoteBlobRef = Schema.ToType<typeof RemoteBlobRefSchema>;

const LocalBlobRefSchema = {
  required: ["localBlobRef"],
  properties: {
    localBlobRef: { type: "string" },
  },
  additionalProperties: false,
} as const satisfies Schema;
type LocalBlobRef = Schema.ToType<typeof LocalBlobRefSchema>;

export const BlobRefSchema = {
  oneOf: [RemoteBlobRefSchema, LocalBlobRefSchema],
} as const satisfies Schema;

/**
 * Represents a reference to a blob as a plain JSON object.
 * Do NOT create this type directly.
 * Use the BlobStore to create and manage blob references.
 */
export type BlobRef = Schema.ToType<typeof BlobRefSchema>;

function isRemoteBlobRef(ref: unknown): ref is RemoteBlobRef {
  const maybe = ref as Partial<RemoteBlobRef> | undefined;
  return typeof maybe?.remoteBlobRef === "string";
}

function isLocalBlobRef(ref: unknown): ref is LocalBlobRef {
  const maybe = ref as Partial<LocalBlobRef> | undefined;
  return typeof maybe?.localBlobRef === "string";
}

export function isBlobRef(value: unknown): value is BlobRef {
  return isRemoteBlobRef(value) || isLocalBlobRef(value);
}

function isRemoteUrl(url: string): url is RemoteUrl {
  return url.startsWith(remoteUrlPrefix);
}

function toRequest(ref: LocalBlobRef) {
  return new Request(`${window.location.origin}/${ref.localBlobRef}`);
}

/**
 * Defined as a symbol because we only want it used by internal code like DataCache.
 */
export const hasBlobInternalDoNotUse = Symbol("hasBlob");

/**
 * A blob store is a service that can efficiently store blobs across sessions and retrieve them using the browsers Cache api.
 */
export interface BlobStore {
  /**
   * Stores a blob and returns a reference to it.
   * Blob references are based upon the content and type of the Blob.
   * If an equivalent blob is stored, an equivalent reference will be returned every time.
   */
  getRef(b: Blob | string): Promise<BlobRef>;
  /**
   * Gets a blob from the blob store or null if it is not available.
   */
  getBlob(r: BlobRef | null): Promise<Blob | null>;
  /**
   * Checks if the blob is still available.
   */
  hasBlob(r: BlobRef | null): Promise<boolean>;
  /**
   * Do NOT use this directly, use useBorrowUrl hook instead as it will automatically return the url when the component unmounts.
   */
  borrowUrl(r: BlobRef | null): Promise<string | null>;
  /**
   * Return a url that was previously borrowed from borrowUrl.
   * Failure to do so may result in memory leaking.
   * @param url The url provided by borrowUrl.
   */
  returnUrl(url: string | null): void;
  /**
   * Removes a blob from the store.
   */
  releaseBlob(r: BlobRef): Promise<void>;
  /**
   * Creates a new remote blob ref. The url must start with http.
   * This should only be called if the remote content is persistent and immutable.
   */
  createRemoteBlobRef(url: string): BlobRef;
  /**
   * TEST ONLY: Gets the current borrow count for a blob reference.
   * This should only be used in tests to verify reference counting behavior.
   * @param r The blob reference to check
   * @returns The number of times the blob reference has been borrowed, or 0 if not borrowed
   */
  _testGetBorrowCount(r: BlobRef): number;
}

/**
 * Creates a new blob store instance.
 */
export function createBlobStore() {
  const cachePromise = getManagedPersistentCache("blobstore", {
    maximumMemoryEntries: 10,
    maximumStorageEntries: 1000,
  });

  // Track borrowed URLs and their reference counts
  const borrowedUrls = new Map<string, { url: string; count: number }>();
  // Reverse mapping for O(1) lookup
  const urlToKey = new Map<string, string>();

  async function getRef(blob: Blob | string): Promise<BlobRef> {
    const cache = await cachePromise;
    if (typeof blob === "string") {
      //  if this is not a remote url, then we can assume it is a data url and fetch the blob from it.
      blob = await (await fetch(blob)).blob();
    }
    const ref = {
      localBlobRef: await blobToHash(blob),
    } as const satisfies LocalBlobRef;

    const request = toRequest(ref);
    const response = new Response(blob);

    await cache.put(request, response);
    return ref;
  }

  async function hasBlob(r: BlobRef): Promise<boolean> {
    if (isRemoteBlobRef(r)) {
      return true;
    }
    const cache = await cachePromise;
    const response = await cache.match(toRequest(r));
    return response !== undefined;
  }

  async function getBlob(r?: BlobRef | null): Promise<Blob | null> {
    if (!r) {
      return null;
    }
    const response = await (isRemoteBlobRef(r)
      ? fetch(r.remoteBlobRef)
      : (await cachePromise).match(toRequest(r)));
    if (!response) {
      return null;
    }
    if (!response.ok) {
      // this should only happen with remote urls. local blob responses are always ok.
      throw new Error(response.statusText);
    }
    return response.blob();
  }

  async function releaseBlob(r: BlobRef): Promise<void> {
    if (isLocalBlobRef(r)) {
      const cache = await cachePromise;
      cache.delete(toRequest(r));
    }
  }

  /**
   * prevent parallel execution to avoid race condition in borrowUrl while awaiting getBlob
   */
  const borrowUrlInternalNoIncrement = preventParallelExecution(async (key: string, r: BlobRef): Promise<{ url: string; count: number } | null> => {
    if (isRemoteBlobRef(r)) {
      return { url: r.remoteBlobRef, count: 0 };
    }
    const blob = await getBlob(r);
    if (!blob) {
      return null;
    }
    const url = URL.createObjectURL(blob);
    const existing = { url, count: 0 };
    borrowedUrls.set(key, existing);
    urlToKey.set(url, key);
    return existing;
  });

  async function borrowUrl(r: BlobRef): Promise<string | null> {
    const key = JSON.stringify(r);
    const existing = borrowedUrls.get(key) ?? await borrowUrlInternalNoIncrement(key, r);
    if (!existing) {
      return null;
    }
    existing.count++;
    return existing.url;
  }

  function returnUrl(url: string | null) {
    if (!url) {
      return;
    }

    const key = urlToKey.get(url);
    if (key) {
      const entry = borrowedUrls.get(key)!;
      if (entry) {
        entry.count--;
        if (entry.count <= 0) {
          borrowedUrls.delete(key);
          urlToKey.delete(url);
          if (!isRemoteUrl(url)) {
            URL.revokeObjectURL(url);
          }
        }
      }
    }
  }

  function createRemoteBlobRef(url: string): BlobRef {
    if (!isRemoteUrl(url)) {
      throw new Error(
        `Invalid url, expected to start with (${remoteUrlPrefix}): ${url}`
      );
    }
    return { remoteBlobRef: url } satisfies RemoteBlobRef;
  }

  function _testGetBorrowCount(r: BlobRef): number {
    const key = JSON.stringify(r);
    return borrowedUrls.get(key)?.count ?? 0;
  }

  return {
    getRef,
    getBlob,
    hasBlob,
    borrowUrl,
    returnUrl,
    releaseBlob,
    createRemoteBlobRef,
    _testGetBorrowCount,
  } as const satisfies BlobStore;
}

/**
 * The global blob store that can be used to store and retrieve blobs.
 */
export const blobStore: BlobStore = createBlobStore();
