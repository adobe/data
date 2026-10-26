// © 2026 Adobe. MIT License. See /LICENSE for details.
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
    cacheDir = realpathSync(mkdtempSync(fileURLToPath(new URL("../../node_modules/.vite-cold-", import.meta.url))));
    const logger = createLogger("info");
    const record = (message: string): void => void logged.push(message);
    server = await createServer({
        configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)), cacheDir, clearScreen: false,
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

it("serves the guide from a cold start of its own dev server, its program finishing, without reloading the page to optimize late dependencies", async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${server.resolvedUrls?.local[0] ?? ""}#3-systems`);
        page.on("pageerror", error => logged.push(`page: ${error.message}`));
        await page.waitForFunction(() => /Finished/.test(document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? ""), null, { timeout: 90000 }).catch(async (error: unknown) => { throw new Error(`${String(error)}\n${logged.join("\n")}\n${await page.evaluate(() => document.querySelector("guide-status")?.shadowRoot?.textContent ?? "no status")}`); });
        expect(logged.filter(message => /optimized dependencies changed|reloading/.test(message))).toEqual([]);
    } finally {
        await page.close();
    }
}, 120000);

it("doesn't reload the page as the package it reads is built again, its next load reading the new files", async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${server.resolvedUrls?.local[0] ?? ""}#1-resources`);
        await page.waitForFunction(() => /Finished/.test(document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? ""), null, { timeout: 90000 });
        await page.evaluate(() => Reflect.set(globalThis, "unreloaded", true));
        // As the package's build writes them: its compiled modules, which the page's world and the compiler read.
        for (const path of ["../../../ecs/dist/index.js", "../../../ecs/dist/interface/math/vec3/index.js", "../../../ecs/src/interface/index.ts"]) {
            const file = fileURLToPath(new URL(path, import.meta.url));
            writeFileSync(file, readFileSync(file, "utf8"));
        }
        await page.waitForTimeout(2000);
        expect(await page.evaluate(() => Reflect.get(globalThis, "unreloaded"))).toBe(true);
        await page.reload();
        await page.waitForFunction(() => /Finished/.test(document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? ""), null, { timeout: 90000 });
    } finally {
        await page.close();
    }
}, 120000);
