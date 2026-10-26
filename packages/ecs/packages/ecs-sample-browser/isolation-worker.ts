// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The samples' service worker, registered by every page of the built samples that isn't isolated across origins (see
 * `publish.ts`). It passes on every response in its scope with the headers that isolate a page, so shared memory and
 * the world's workers work on a host that can't send them, such as GitHub Pages.
 */

/** A service worker's global scope, by what this one uses: the page's types don't declare it. */
type Scope = {
    readonly clients: { readonly claim: () => Promise<void> };
    readonly skipWaiting: () => Promise<void>;
    readonly addEventListener: (type: string, listener: (event: Event) => void) => void;
};
type ExtendableEvent = Event & { readonly waitUntil: (promise: Promise<unknown>) => void };
type FetchEvent = ExtendableEvent & { readonly request: Request; readonly respondWith: (response: Promise<Response>) => void };

const isScope = (value: unknown): value is Scope => typeof value === "object" && value !== null && "clients" in value && "skipWaiting" in value;
const isExtendable = (event: Event): event is ExtendableEvent => "waitUntil" in event;
const isFetch = (event: Event): event is FetchEvent => isExtendable(event) && "request" in event && "respondWith" in event;

const isolated = (response: Response): Response => {
    // An opaque response's headers can't be read or changed.
    if (response.status === 0) return response;
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

/**
 * A response to `request` from the network: a request the network failed, as it may while the server
 * is busy, is made once more, unless whoever asked has given up on it, and one failed again is a network error, as
 * the browser gives one, rather than a rejection, which the browser reports as the worker's own failure.
 */
export const passOn = async (request: Request, network: (request: Request) => Promise<Response> = request => fetch(request)): Promise<Response> => {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await network(request);
        } catch {
            if (request.signal.aborted) break;
        }
    }
    return Response.error();
};

const scope: unknown = globalThis;
if (isScope(scope)) {
    scope.addEventListener("install", () => void scope.skipWaiting());
    scope.addEventListener("activate", event => {
        if (isExtendable(event)) event.waitUntil(scope.clients.claim());
    });
    scope.addEventListener("fetch", event => {
        if (!isFetch(event)) return;
        const { request } = event;
        // A request the browser may only answer from its cache can't be made again from here.
        if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
        if (new URL(request.url).origin !== location.origin) return;
        event.respondWith(passOn(request).then(isolated));
    });
}
