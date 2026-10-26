// © 2026 Adobe. MIT License. See /LICENSE for details.
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createLogger, createServer, type ViteDevServer } from "vite";

// The dev server as a first run starts it, on a cache of dependencies it hasn't optimized yet: it optimizes every
// dependency a page or its workers import before the first page asks, so it never reloads the page mid-load.

let cacheDir = "";
let server: ViteDevServer;
let browser: Browser;
const logged: string[] = [];
beforeAll(async () => {
    // In node_modules, as a cache of dependencies always is, so the build names the modules it optimizes by their path there.
    cacheDir = realpathSync(mkdtempSync(fileURLToPath(new URL("node_modules/.vite-cold-", import.meta.url))));
    const logger = createLogger("info");
    const record = (message: string): void => void logged.push(message);
    server = await createServer({
        configFile: fileURLToPath(new URL("vite.config.ts", import.meta.url)), cacheDir, clearScreen: false,
        customLogger: { ...logger, info: record, warn: record, warnOnce: record, error: record },
        server: { port: 0, strictPort: false },
    });
    await server.listen();
    browser = await chromium.launch({ channel: "chromium", args: ["--enable-unsafe-webgpu"] });
}, 120000);
afterAll(async () => {
    await browser.close();
    await server.close();
    rmSync(cacheDir, { recursive: true, force: true });
});

it("serves the guide from a cold start, its program finishing, without reloading the page to optimize late dependencies", async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${server.resolvedUrls?.local[0] ?? ""}#ecs-guide/3-systems`);
        page.on("pageerror", error => logged.push(`page: ${error.message}`));
        await page.waitForFunction(() => /Finished/.test(document.querySelector("iframe")?.contentDocument?.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? ""), null, { timeout: 90000 }).catch(async (error: unknown) => { throw new Error(`${String(error)}\n${logged.join("\n")}\n${await page.evaluate(() => document.querySelector("iframe")?.contentDocument?.querySelector("guide-status")?.shadowRoot?.textContent ?? "no status")}`); });
        expect(logged.filter(message => /optimized dependencies changed|reloading/.test(message))).toEqual([]);
    } finally {
        await page.close();
    }
}, 120000);
