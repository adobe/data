// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const types: { readonly [extension: string]: string } = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
};

/**
 * Serves a folder as a static host does: each file with its type, a folder's `index.html` for the folder, and, when
 * `isolated`, the headers that isolate a page across origins, which a host such as GitHub Pages can't send.
 */
export const serve = async (folder: string, { isolated }: { readonly isolated: boolean }): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
    const server = createServer((request, response) => {
        const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname));
        let file = join(folder, path);
        try {
            if (!file.startsWith(folder)) throw new Error("outside the folder");
            if (statSync(file).isDirectory()) file = join(file, "index.html");
            statSync(file);
        } catch {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, {
            "Content-Type": types[extname(file)] ?? "application/octet-stream",
            ...isolated ? { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" } : {},
        });
        createReadStream(file).pipe(response);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("the server isn't listening on a port");
    return { url: `http://127.0.0.1:${address.port}/`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
};
