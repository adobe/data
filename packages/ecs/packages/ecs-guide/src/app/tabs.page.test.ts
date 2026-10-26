// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { consoleOf, launch, statusOf } from "./page.test-helper.js";

let browser: Browser;
beforeAll(async () => {
    browser = await launch();
});
afterAll(async () => {
    await browser.close();
});

const edit = async (page: Page): Promise<void> => {
    await page.locator("guide-editor .cm-content").click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" ");
};
const runFolders = (page: Page): Promise<string[]> => page.evaluate(async () => {
    const keys = await (await caches.open("ecs-guide-runs")).keys();
    return [...new Set(keys.map(request => /ecs-guide-runs\/([^/]+)\//.exec(new URL(request.url).pathname)?.[1] ?? ""))];
});

it("runs each tab's examples in its own frames, though tabs share the cache, and drops a closed tab's runs", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
        const first = await context.newPage();
        await first.goto(`${inject("guide")}#1-resources`);
        await statusOf(first);
        const own = await consoleOf(first);
        const second = await context.newPage();
        await second.goto(`${inject("guide")}#3-systems`);
        await statusOf(second);
        for (let round = 0; round < 4; round++) {
            await edit(second);
            await edit(first);
            await first.waitForTimeout(1500);
            await statusOf(first);
            expect(await consoleOf(first)).toBe(own);
        }
        expect((await runFolders(first)).length).toBe(2);
        await second.close();
        const third = await context.newPage();
        await third.goto(`${inject("guide")}#2-entities-components-and-archetypes`);
        await statusOf(third);
        // The closed tab's folder is gone; the open tabs' remain.
        expect((await runFolders(first)).length).toBe(2);
    } finally {
        await context.close();
    }
});
