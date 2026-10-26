// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createReadStream, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Frame, type Page } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { build } from "vite";

// The built samples, served as a static host such as GitHub Pages serves them: without the headers that isolate a
// page across origins, which the samples' service worker gives them.

const types: { readonly [extension: string]: string } = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".png": "image/png" };

let outDir = "";
let server: Server;
let url = "";
let browser: Browser;
beforeAll(async () => {
    outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-samples-")));
    await build({ configFile: fileURLToPath(new URL("vite.config.ts", import.meta.url)), logLevel: "warn", build: { outDir, emptyOutDir: true } });
    server = createServer((request, response) => {
        let file = join(outDir, normalize(decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)));
        try {
            if (!file.startsWith(outDir)) throw new Error("outside the site");
            if (statSync(file).isDirectory()) file = join(file, "index.html");
            statSync(file);
        } catch {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
        createReadStream(file).pipe(response);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("the server isn't listening on a port");
    url = `http://127.0.0.1:${address.port}/`;
    browser = await chromium.launch({ channel: "chromium", args: ["--enable-unsafe-webgpu"] });
}, 180000);
afterAll(async () => {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(outDir, { recursive: true, force: true });
});

/** The sample browser at the site's root page with `hash`, once it's isolated, and the frame of the sample it shows. */
const sample = async (hash: string): Promise<{ readonly page: Page; readonly frame: Frame; readonly errors: string[] }> => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${url}${hash}`);
    await page.waitForURL(/ecs-sample-browser\//);
    await page.waitForFunction(() => crossOriginIsolated, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("iframe")?.contentWindow?.crossOriginIsolated === true, null, { timeout: 30000 });
    // What the page and its sample threw before the page was isolated, which loads it again, is gone with it.
    errors.length = 0;
    const frame = page.frames().find(item => item.parentFrame() === page.mainFrame());
    if (frame === undefined) throw new Error("no sample's frame");
    return { page, frame, errors };
};

it("opens the sample browser from the site's root, isolated by its service worker, its pages' urls relative", async () => {
    const { page, errors } = await sample("");
    try {
        expect(new URL(page.url()).pathname).toBe("/ecs-sample-browser/");
        expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/isolation-worker\.js$/);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("runs the todo sample, adding a todo", async () => {
    const { page, frame, errors } = await sample("#ecs-todo-vanillajs");
    try {
        await frame.locator("todo-entry input").fill("milk");
        await frame.locator("todo-entry input").press("Enter");
        await frame.locator("todo-row").first().waitFor();
        expect(await frame.locator("todo-row").count()).toBe(1);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("runs the particles sample, frame after frame", async () => {
    const { page, frame } = await sample("#ecs-particles-webgpu");
    try {
        // A sample's page served from the site is what this checks, not its speed: a software adapter, as CI's runners
        // have, can't draw the default million particles ten times in a minute.
        await frame.goto(new URL("?count=4096", frame.url()).href);
        const webgpu = await frame.evaluate(async () => (await navigator.gpu?.requestAdapter()) !== null && navigator.gpu !== undefined);
        if (!webgpu) {
            await frame.waitForFunction(() => document.querySelector("#stats")?.textContent === "This browser has no WebGPU.");
            return;
        }
        await frame.waitForFunction(() => {
            const stats: unknown = Reflect.get(globalThis, "sampleStats");
            return typeof stats === "function" && Number(Reflect.get(Object(stats()), "frames")) > 10;
        }, null, { timeout: 60000 });
    } finally {
        await page.close();
    }
}, 90000);

it("runs the transfers sample, its sprites drawn on a worker", async () => {
    const { page, frame, errors } = await sample("#ecs-transfers-canvas");
    try {
        await frame.waitForFunction(() => /^([2-9]|\d\d) sprites, .* frame \d+/.test(document.querySelector("#stats")?.textContent ?? ""), null, { timeout: 60000 });
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
}, 90000);

it("runs the guide at a chapter named in the hash, its threads chapter's program finishing", async () => {
    const { page, frame, errors } = await sample("#ecs-guide/19-threads");
    try {
        expect(new URL(frame.url()).hash).toBe("#19-threads");
        await frame.waitForFunction(() => /Finished/.test(document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? ""), null, { timeout: 60000 });
        const run = frame.childFrames()[0];
        expect(await run?.evaluate(() => crossOriginIsolated)).toBe(true);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
}, 90000);

it("isolates the sample browser again after a hard reload, which loads past its service worker", async () => {
    const { page, errors } = await sample("#ecs-guide/19-threads");
    try {
        const session = await page.context().newCDPSession(page);
        for (let reload = 0; reload < 2; reload++) {
            await session.send("Page.reload", { ignoreCache: true });
            await page.waitForFunction(() => crossOriginIsolated, null, { timeout: 30000 });
            await page.waitForFunction(() => /Finished/.test(document.querySelector("iframe")?.contentDocument?.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? ""), null, { timeout: 60000 });
        }
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
}, 150000);

it("draws its bar with Spectrum's tokens, in the scheme the system prefers", async () => {
    for (const colorScheme of ["light", "dark"] as const) {
        const { page } = await sample("#ecs-todo-vanillajs");
        try {
            await page.emulateMedia({ colorScheme });
            await page.waitForFunction(scheme => document.querySelector("sp-theme")?.getAttribute("color") === scheme, colorScheme);
            const colors = await page.evaluate(() => {
                const probe = document.createElement("div");
                probe.style.background = "var(--spectrum-background-layer-1-color)";
                document.querySelector("sp-theme")?.append(probe);
                const expected = getComputedStyle(probe).backgroundColor;
                probe.remove();
                return { nav: getComputedStyle(document.querySelector("nav") ?? document.body).backgroundColor, expected };
            });
            expect(colors.nav).toBe(colors.expected);
            expect(colors.expected).toBe(colorScheme === "dark" ? "rgb(38, 38, 38)" : "rgb(248, 248, 248)");
        } finally {
            await page.close();
        }
    }
}, 90000);
