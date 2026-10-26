// © 2026 Adobe. MIT License. See /LICENSE for details.
import { runsCache, runsFolder } from "./compile/run-files.js";

/**
 * The guide's service worker. Its scope is the folder it's served from. It serves each run's files from the cache the
 * compiler's worker puts them in, under `runsFolder`, a folder for each page, and gives every response it passes on
 * the headers that isolate a page across origins, so shared memory and the world's workers work on a host that can't
 * set them, such as GitHub Pages.
 */

/** A service worker's global scope, by what this one uses: the page's types don't declare it. */
type Scope = {
    readonly registration: { readonly scope: string };
    readonly clients: { readonly claim: () => Promise<void>; readonly get: (id: string) => Promise<unknown> };
    readonly skipWaiting: () => Promise<void>;
    readonly addEventListener: (type: string, listener: (event: Event) => void) => void;
};
type ExtendableEvent = Event & { readonly waitUntil: (promise: Promise<unknown>) => void };
type FetchEvent = ExtendableEvent & { readonly request: Request; readonly respondWith: (response: Promise<Response>) => void };

/** A page's message naming its folder of runs, with the port it waits on for the answer. */
type PageMessage = ExtendableEvent & { readonly data: unknown; readonly source: { readonly id: string } | null; readonly ports: readonly MessagePort[] };
const isPageMessage = (event: Event): event is PageMessage => isExtendable(event) && "data" in event && "source" in event && "ports" in event;

const isScope = (value: unknown): value is Scope => typeof value === "object" && value !== null && "registration" in value && "clients" in value && "skipWaiting" in value;
const isExtendable = (event: Event): event is ExtendableEvent => "waitUntil" in event;
const isFetch = (event: Event): event is FetchEvent => isExtendable(event) && "request" in event && "respondWith" in event;


/** A response with the isolation headers, which a page and its workers need for shared memory. */
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

const respond = async (request: Request, runs: string): Promise<Response> => {
    if (request.url.startsWith(runs)) {
        const cached = await (await caches.open(runsCache)).match(request.url);
        return isolated(cached ?? new Response("This run is gone: a later one replaced it.", { status: 404 }));
    }
    return isolated(await passOn(request));
};

/** The file in a page's folder of runs that names the page, by its client's id. */
const pageFile = "page";

/**
 * Records that the page `client` runs under `folder`, and deletes every other page's folder whose page is gone,
 * so a page's runs never reach another's, and the cache doesn't grow from one visit to the next.
 */
const adopt = async (scope: Scope, runs: string, folder: string, client: string): Promise<void> => {
    const cache = await caches.open(runsCache);
    await cache.put(`${runs}${folder}/${pageFile}`, new Response(client));
    const folders = new Map<string, Request[]>();
    for (const request of await cache.keys()) {
        if (!request.url.startsWith(runs)) continue;
        const name = request.url.slice(runs.length).split("/")[0] ?? "";
        folders.set(name, [...folders.get(name) ?? [], request]);
    }
    for (const [name, requests] of folders) {
        if (name === folder) continue;
        const owner = await cache.match(`${runs}${name}/${pageFile}`);
        const id = owner === undefined ? "" : await owner.text();
        if (id !== "" && await scope.clients.get(id) !== undefined) continue;
        await Promise.all(requests.map(request => cache.delete(request)));
    }
};

const scope: unknown = globalThis;
if (isScope(scope)) {
    const runs = new URL(runsFolder, scope.registration.scope).href;
    scope.addEventListener("message", event => {
        if (!isPageMessage(event) || event.source === null) return;
        const folder: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "folder") : undefined;
        if (typeof folder !== "string" || !/^[\w-]+$/.test(folder)) return;
        const [port] = event.ports;
        event.waitUntil(adopt(scope, runs, folder, event.source.id).then(() => port?.postMessage({ adopted: true }), (error: unknown) => port?.postMessage({ adopted: false, reason: String(error) })));
    });
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
        event.respondWith(respond(request, runs));
    });
}
