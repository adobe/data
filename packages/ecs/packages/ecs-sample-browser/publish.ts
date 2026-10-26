// © 2026 Adobe. MIT License. See /LICENSE for details.
import { relative } from "node:path";
import type { Plugin } from "vite";

/** Where the built samples' service worker is, at the root of the build (`isolation-worker.ts`). */
export const isolationWorker = "isolation-worker.js";

/**
 * Registers the samples' service worker from a page that isn't isolated across origins, then loads the page again
 * under it: a host that can't send the isolation headers, such as GitHub Pages, gets them from the worker. A page
 * loaded past a worker that's there, as a hard reload does, loads again too. It loads again with a marker in its
 * query, which it takes off as it loads, and a page loaded with the marker never loads again, so it can't loop. The
 * marker is in the address rather than storage: a page's session storage doesn't follow it as it becomes isolated. Only
 * the top page loads again: a frame is isolated once the page framing it is. `root` is the path from the page to the
 * build's root.
 */
const registration = (root: string): string => `(() => {
    if (!("serviceWorker" in navigator) || window !== top) return;
    const marker = "isolating";
    const search = new URLSearchParams(location.search);
    const marked = search.has(marker);
    if (marked) {
        search.delete(marker);
        const rest = search.toString();
        history.replaceState(history.state, "", location.pathname + (rest === "" ? "" : "?" + rest) + location.hash);
    }
    if (crossOriginIsolated || marked) return;
    // A navigation, not a reload, which after a hard reload would load past the worker again.
    let going = false;
    const again = () => {
        if (going) return;
        going = true;
        search.set(marker, "");
        location.replace(location.pathname + "?" + search.toString() + location.hash);
    };
    navigator.serviceWorker.addEventListener("controllerchange", again);
    navigator.serviceWorker.register(new URL(${JSON.stringify(`${root}${isolationWorker}`)}, location.href), { type: "module", scope: new URL(${JSON.stringify(root)}, location.href).href })
        .then(registered => { if (registered.active !== null) again(); }, () => {});
})();`;

/** The build's root page: it sends the address it's given to the sample browser, keeping its hash. */
const rootPage = (browser: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ECS Samples</title>
<script>location.replace(${JSON.stringify(browser)} + location.hash);</script>
</head>
<body><a href="${browser}">ECS Samples</a></body>
</html>
`;

/**
 * Publishes the build wherever it's served: every page registers the service worker that isolates it where the host
 * doesn't, and the root page opens the sample browser, so `samples/#<package>` opens a sample's tab.
 */
export const publish = (packages: string, browser: string): Plugin => ({
    name: "publish-samples",
    apply: "build",
    transformIndexHtml: {
        order: "pre",
        handler: (_html, context) => {
            const depth = relative(packages, context.filename).split(/[\\/]/).length - 1;
            return [{ tag: "script", children: registration("../".repeat(depth)), injectTo: "head-prepend" }];
        },
    },
    generateBundle() {
        this.emitFile({ type: "asset", fileName: "index.html", source: rootPage(browser) });
    },
});
