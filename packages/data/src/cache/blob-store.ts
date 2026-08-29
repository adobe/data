// © 2026 Adobe. MIT License. See /LICENSE for details.
import { getDeferredManagedPersistentCache } from "./get-persistent-cache.js";
import { type DeferredFallbackAsyncCache } from "./deferred-fallback-async-cache.js";
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

/**
 * A ref holding both keys: the content hash (identity) plus a persistent,
 * immutable URL the same content is re-fetchable from. Lets a local asset be
 * augmented with a remote URL on save without changing identity, keeping the
 * local fast-path while guaranteeing re-derivability from a cold cache.
 */
const CombinedBlobRefSchema = {
  required: ["localBlobRef", "remoteBlobRef"],
  properties: {
    localBlobRef: { type: "string" },
    remoteBlobRef: RemoteUrlSchema,
  },
  additionalProperties: false,
} as const satisfies Schema;
type CombinedBlobRef = Schema.ToType<typeof CombinedBlobRefSchema>;

// Each `oneOf` member forbids the other's extra key, so a value matches exactly
// one shape: remote-only, local-only, or combined (both keys present).
export const BlobRefSchema = {
  oneOf: [RemoteBlobRefSchema, LocalBlobRefSchema, CombinedBlobRefSchema],
} as const satisfies Schema;

/**
 * Represents a reference to a blob as a plain JSON object.
 * Do NOT create this type directly.
 * Use the BlobStore to create and manage blob references.
 */
export type BlobRef = Schema.ToType<typeof BlobRefSchema>;

// A ref carrying a content hash (local-only or combined) / a remote URL
// (remote-only or combined). The guards narrow to these so a combined ref keeps
// both capabilities available to the caller.
type WithLocalRef = LocalBlobRef | CombinedBlobRef;
type WithRemoteRef = RemoteBlobRef | CombinedBlobRef;

function isRemoteBlobRef(ref: unknown): ref is WithRemoteRef {
  const maybe = ref as Partial<RemoteBlobRef> | undefined;
  return typeof maybe?.remoteBlobRef === "string";
}

function isLocalBlobRef(ref: unknown): ref is WithLocalRef {
  const maybe = ref as Partial<LocalBlobRef> | undefined;
  return typeof maybe?.localBlobRef === "string";
}

export function isBlobRef(value: unknown): value is BlobRef {
  return isRemoteBlobRef(value) || isLocalBlobRef(value);
}

/**
 * Namespaced surface for {@link BlobRef}, mirroring `BlobHandle` / `BlobMeta`
 * in `../blob/`. Lets consumers reach the schema and guard through the type's
 * own name — `BlobRef.schema`, `BlobRef.is(x)` — instead of importing the
 * standalone `BlobRefSchema` / `isBlobRef`. An ECS component that stores a
 * BlobRef has no natural empty value, so model the column as
 * `Nullable(BlobRef.schema)` with a `null` default (no cast) rather than a
 * `null as unknown as BlobRef` placeholder.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace BlobRef {
  export const schema = BlobRefSchema;
  export const is = isBlobRef;
}

function isRemoteUrl(url: string): url is RemoteUrl {
  return url.startsWith(remoteUrlPrefix);
}

function toRequest(ref: WithLocalRef) {
  return new Request(`${window.location.origin}/${ref.localBlobRef}`);
}

// Canonical identity key. Content identity (the hash) wins when present, so a
// combined ref and a local-only ref with the same hash canonicalize equal and
// share borrow/dedup state; a promotion (adding a URL) does not change identity.
function toRefKey(ref: BlobRef): string {
  return isLocalBlobRef(ref)
    ? `local:${ref.localBlobRef}`
    : `remote:${ref.remoteBlobRef}`;
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
   *
   * The returned ref is readable immediately, but its durable (storage-tier)
   * write is deferred off the critical path. Any layer that persists a document
   * containing a local blob ref MUST await {@link BlobStore.flush} first, or the
   * persisted ref may point at bytes that never reached storage and will not
   * resolve after reload.
   */
  getRef(b: Blob | string): Promise<BlobRef>;
  /**
   * Resolves once every deferred blob write has reached durable storage.
   * Rejects if any deferred write failed. Call this before persisting any
   * document that references local blob refs — it is the durability barrier
   * that makes deferred writes safe.
   */
  flush(): Promise<void>;
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
   * Augments an existing local blob ref with a remote URL, producing a combined
   * ref (same content identity, now also re-fetchable at the URL). The URL must
   * start with http and MUST serve immutable content whose hash equals the
   * ref's `localBlobRef`; the local fast-path and dedup identity are preserved.
   * @param ref A local (or already-combined) blob ref.
   * @param url The persistent, immutable URL the same content is served from.
   */
  withRemoteUrl(ref: BlobRef, url: string): BlobRef;
  /**
   * TEST ONLY: Gets the current borrow count for a blob reference.
   * This should only be used in tests to verify reference counting behavior.
   * @param r The blob reference to check
   * @returns The number of times the blob reference has been borrowed, or 0 if not borrowed
   */
  _testGetBorrowCount(r: BlobRef): number;
}

/**
 * Options for {@link createBlobStore}.
 */
export interface BlobStoreOptions {
  /**
   * When true, bytes fetched via the remote fallback of a combined ref are
   * re-hashed and compared to the ref's `localBlobRef`; a mismatch throws
   * rather than serving unexpected bytes. Defaults to false (remote content is
   * contractually immutable). Enable in debug/verification builds.
   */
  verifyRemoteHash?: boolean;
}

/**
 * Creates a new blob store instance.
 */
export function createBlobStore(options: BlobStoreOptions = {}) {
  const { verifyRemoteHash = false } = options;
  // Lazy-init the persistent cache so that importing this module on a
  // runtime without `globalThis.caches` (e.g. Node) does not produce an
  // unhandled rejection. The cache promise is only kicked off the first
  // time a blob store method actually needs it. See CLAUDE.md for the
  // rationale behind the lazy-init pattern.
  let cachePromiseInternal: Promise<DeferredFallbackAsyncCache> | undefined;
  const cachePromise = (): Promise<DeferredFallbackAsyncCache> =>
    (cachePromiseInternal ??= getDeferredManagedPersistentCache("blobstore", {
      maximumMemoryEntries: 10,
      // No storage-tier cap: local blob refs already self-heal from
      // remoteBlobRef on eviction (see getBlob), so we rely on the browser's
      // own Cache Storage eviction instead of a manual FIFO scan/trim.
    }));

  // Track borrowed URLs and their reference counts
  const borrowedUrls = new Map<string, { url: string; count: number }>();
  // Reverse mapping for O(1) lookup
  const urlToKey = new Map<string, string>();

  async function getRef(blob: Blob | string): Promise<BlobRef> {
    const cache = await cachePromise();
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

  // Reads from the local cache only (memory -> pending -> storage), no network.
  async function getLocalResponse(
    r: WithLocalRef
  ): Promise<Response | undefined> {
    return (await cachePromise()).match(toRequest(r));
  }

  async function hasBlob(r: BlobRef): Promise<boolean> {
    // Local hit is authoritative and cheap. A remote URL is assumed available
    // (remote content is contractually immutable), so mirror that here.
    if (isLocalBlobRef(r) && (await getLocalResponse(r)) !== undefined) {
      return true;
    }
    return isRemoteBlobRef(r);
  }

  async function getBlob(r?: BlobRef | null): Promise<Blob | null> {
    if (!r) {
      return null;
    }
    // Local-first: a combined ref resolves from cache with no network when the
    // bytes are present.
    if (isLocalBlobRef(r)) {
      const local = await getLocalResponse(r);
      if (local) {
        return local.blob();
      }
    }
    // Remote fallback: remote-only refs, or a combined ref whose local bytes
    // have been evicted. Self-heal by repopulating the local cache under the
    // known hash so the next read is served locally.
    if (isRemoteBlobRef(r)) {
      const response = await fetch(r.remoteBlobRef);
      if (!response) {
        return null;
      }
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      const blob = await response.blob();
      if (isLocalBlobRef(r)) {
        if (verifyRemoteHash) {
          const actual = await blobToHash(blob);
          if (actual !== r.localBlobRef) {
            // Remote violated its immutability contract, or the URL is wrong.
            throw new Error(
              `Remote blob hash mismatch: expected ${r.localBlobRef}, got ${actual} from ${r.remoteBlobRef}`
            );
          }
        }
        const cache = await cachePromise();
        await cache.put(toRequest(r), new Response(blob));
      }
      return blob;
    }
    return null;
  }

  async function releaseBlob(r: BlobRef): Promise<void> {
    if (isLocalBlobRef(r)) {
      const cache = await cachePromise();
      await cache.delete(toRequest(r));
    }
  }

  /**
   * prevent parallel execution to avoid race condition in borrowUrl while awaiting getBlob
   */
  const borrowUrlInternalNoIncrement = preventParallelExecution(async (key: string, r: BlobRef): Promise<{ url: string; count: number } | null> => {
    // Local-first: hand out an object URL when the bytes are present locally.
    if (isLocalBlobRef(r)) {
      const response = await getLocalResponse(r);
      if (response) {
        const url = URL.createObjectURL(await response.blob());
        const existing = { url, count: 0 };
        borrowedUrls.set(key, existing);
        urlToKey.set(url, key);
        return existing;
      }
    }
    // Otherwise defer to the remote URL directly (the browser fetches/caches it).
    if (isRemoteBlobRef(r)) {
      return { url: r.remoteBlobRef, count: 0 };
    }
    return null;
  });

  async function borrowUrl(r: BlobRef | null): Promise<string | null> {
    if (!r) {
      return null;
    }
    const key = toRefKey(r);
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

  function withRemoteUrl(ref: BlobRef, url: string): BlobRef {
    if (!isLocalBlobRef(ref)) {
      throw new Error(
        `withRemoteUrl requires a local blob ref (with a content hash)`
      );
    }
    if (!isRemoteUrl(url)) {
      throw new Error(
        `Invalid url, expected to start with (${remoteUrlPrefix}): ${url}`
      );
    }
    return {
      localBlobRef: ref.localBlobRef,
      remoteBlobRef: url,
    } satisfies CombinedBlobRef;
  }

  async function flush(): Promise<void> {
    await (await cachePromise()).flush();
  }

  function _testGetBorrowCount(r: BlobRef): number {
    return borrowedUrls.get(toRefKey(r))?.count ?? 0;
  }

  return {
    getRef,
    flush,
    getBlob,
    hasBlob,
    borrowUrl,
    returnUrl,
    releaseBlob,
    createRemoteBlobRef,
    withRemoteUrl,
    _testGetBorrowCount,
  } as const satisfies BlobStore;
}

/**
 * The global blob store that can be used to store and retrieve blobs.
 */
export const blobStore: BlobStore = createBlobStore();
