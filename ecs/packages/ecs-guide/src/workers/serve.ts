// © 2026 Adobe. MIT License. See /LICENSE for details.

/** What a worker that failed to load says, the page's own failure aside: why, as the import's error has it. */
export type Unavailable = { readonly kind: "unavailable"; readonly reason: string };

export const isUnavailable = (data: unknown): data is Unavailable =>
    typeof data === "object" && data !== null && Reflect.get(data, "kind") === "unavailable" && typeof Reflect.get(data, "reason") === "string";

/**
 * Serves a worker's messages with what `load` gives, once it loads, holding those that arrive before. A worker whose
 * modules failed to load says why, as `Unavailable`, where an entry that failed to load would only fail the worker.
 */
export const serve = (load: () => Promise<{ readonly handle: (data: unknown) => void }>): void => {
    const held: unknown[] = [];
    let handle: ((data: unknown) => void) | null = null;
    addEventListener("message", event => {
        if (handle === null) held.push(event.data);
        else handle(event.data);
    });
    load().then(loaded => {
        handle = loaded.handle;
        for (const data of held.splice(0)) loaded.handle(data);
    }, (error: unknown) => {
        const unavailable: Unavailable = { kind: "unavailable", reason: error instanceof Error ? error.message : String(error) };
        postMessage(unavailable);
    });
};
