// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Creates a per-endpoint monotonic id allocator. Ids identify in-flight calls,
 * subscriptions, and generators originated by THIS endpoint; they need only be
 * unique per-originator (see the caller/host table split in `create-endpoint`),
 * so a simple local counter suffices.
 */
export function createIdAllocator(): () => number {
    let next = 1;
    return () => next++;
}
